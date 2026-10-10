import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, contacts, eventGuestRegistrations, joinInvites, leads, membershipApplications, memberships, profiles} from "@/lib/db/server-schema";
import {insertContactActivity} from "@/lib/db/repos/contact-activities";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {AppLocale} from "@/i18n/routing";
import type {PlanCode} from "@/lib/membership/catalog";
import {createInviteToken, digestInviteToken, isWellFormedInviteToken} from "@/lib/membership/join-invite-token";
import type {Actor} from "@/lib/membership/lifecycle";

export type JoinInvite = Readonly<{
  id: string;
  contactId: string;
  planCode: PlanCode;
  createdByProfileId: string | null;
  expiresAt: Date;
  openedAt: Date | null;
  consumedAt: Date | null;
  supersededAt: Date | null;
  applicationId: string | null;
  createdAt: Date;
}>;
export type InviteState = "live" | "opened" | "consumed" | "expired" | "superseded";

export type OpenedInvite = Readonly<{
  inviteId: string;
  planCode: PlanCode;
  contactDisplayName: string | null;
  inviterFirstName: string | null;
  locale: AppLocale;
  expiresAt: Date;
}>;

export type InvitePrefill = Readonly<{
  displayName: string | null;
  phone: string | null;
  organisation: string | null;
}>;

const uuidSchema = z.string().uuid();
// `patron` is invitation-by-review elsewhere; a lead invite never offers it.
const createInputSchema = z.object({
  contactId: z.string().uuid(),
  planCode: z.enum(["community", "startup", "corporate"]),
}).strict();
const consumeInputSchema = z.object({
  inviteId: z.string().uuid(),
  applicationId: z.string().uuid(),
}).strict();

const inviteRowSchema = z.object({
  id: z.string(),
  contact_id: z.string(),
  plan_code: z.string(),
  created_by_profile_id: z.string().nullable(),
  expires_at: z.coerce.date(),
  opened_at: z.coerce.date().nullable(),
  consumed_at: z.coerce.date().nullable(),
  superseded_at: z.coerce.date().nullable(),
  application_id: z.string().nullable(),
  created_at: z.coerce.date(),
});

const openRowSchema = z.object({
  invite_id: z.string(),
  contact_id: z.string(),
  plan_code: z.string(),
  opened_at: z.coerce.date().nullable(),
  expires_at: z.coerce.date(),
  contact_display_name: z.string().nullable(),
  contact_locale: z.string().nullable(),
  inviter_display_name: z.string().nullable(),
});

const prefillRowSchema = z.object({
  display_name: z.string().nullable(),
  phone: z.string().nullable(),
  organisation: z.string().nullable(),
});

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function toInvite(row: Record<string, unknown>): JoinInvite {
  const parsed = inviteRowSchema.parse(row);
  return {
    id: parsed.id,
    contactId: parsed.contact_id,
    planCode: parsed.plan_code as PlanCode,
    createdByProfileId: parsed.created_by_profile_id,
    expiresAt: parsed.expires_at,
    openedAt: parsed.opened_at,
    consumedAt: parsed.consumed_at,
    supersededAt: parsed.superseded_at,
    applicationId: parsed.application_id,
    createdAt: parsed.created_at,
  };
}

/** Precedence: a terminal fact beats a transient one, so a consumed-then-expired invite reads consumed. */
function inviteState(invite: JoinInvite, now: Date): InviteState {
  if (invite.consumedAt) return "consumed";
  if (invite.supersededAt) return "superseded";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (invite.openedAt) return "opened";
  return "live";
}

function firstWord(name: string | null): string | null {
  const word = name?.trim().split(/\s+/)[0];
  return word ? word : null;
}

function forbidden(): never {
  throw new Error("FORBIDDEN");
}

const INVITE_COLUMNS = sql`id, contact_id, plan_code, created_by_profile_id, expires_at, opened_at, consumed_at, superseded_at, application_id, created_at`;

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createJoinInvitesRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  async function lookupLive(token: unknown) {
    if (!isWellFormedInviteToken(token)) return null;
    const digest = digestInviteToken(token);
    const database = await loadDatabase();
    const row = rowsFrom(await database.execute(sql`
      SELECT i.id AS invite_id, i.contact_id, i.plan_code, i.opened_at, i.expires_at,
             c.display_name AS contact_display_name, c.locale AS contact_locale,
             inviter.display_name AS inviter_display_name
      FROM ${joinInvites} i
      INNER JOIN ${contacts} c ON c.id = i.contact_id
      LEFT JOIN ${profiles} inviter ON inviter.id = i.created_by_profile_id
      WHERE i.token_digest = ${digest}
        AND i.consumed_at IS NULL AND i.superseded_at IS NULL AND i.expires_at > now()
      LIMIT 1
    `))[0];
    if (!row) return null;
    return {database, parsed: openRowSchema.parse(row)};
  }

  function toOpenedInvite(parsed: z.infer<typeof openRowSchema>): OpenedInvite {
    return {
      inviteId: parsed.invite_id,
      planCode: parsed.plan_code as PlanCode,
      contactDisplayName: parsed.contact_display_name,
      inviterFirstName: firstWord(parsed.inviter_display_name),
      locale: parsed.contact_locale === "zh-HK" ? "zh-HK" : "en",
      expiresAt: parsed.expires_at,
    };
  }

  return {
    /**
     * Issuing a new invite retires the old live one. The contact row is locked
     * FOR UPDATE first so two staff issuing at once serialise: without the lock
     * both would supersede the same (empty or stale) set and both new invites
     * would stay live, breaking "one live invite per contact". Lock, supersede and
     * insert share one transaction for the same reason.
     *
     * Only the digest is bound into the INSERT; the raw token is returned to the
     * caller for the link and is never written anywhere.
     */
    async create(actor: Actor, input: unknown): Promise<{invite: JoinInvite; token: string}> {
      requireAdmin(actor);
      const parsed = createInputSchema.parse(input);
      const {token, digest} = createInviteToken();
      const database = await loadDatabase();
      const invite = await database.transaction(async (transaction) => {
        const locked = rowsFrom(await transaction.execute(sql`
          SELECT id FROM ${contacts} WHERE id = ${parsed.contactId} FOR UPDATE
        `))[0];
        if (!locked) throw new Error("CONTACT_NOT_FOUND");

        await transaction.execute(sql`
          UPDATE ${joinInvites}
          SET superseded_at = now()
          WHERE contact_id = ${parsed.contactId} AND consumed_at IS NULL AND superseded_at IS NULL
        `);

        const row = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${joinInvites} (contact_id, plan_code, created_by_profile_id, token_digest, expires_at)
          VALUES (${parsed.contactId}, ${parsed.planCode}, ${actor.profileId}, ${digest}, now() + interval '14 days')
          RETURNING ${INVITE_COLUMNS}
        `))[0];
        if (!row) throw new Error("JOIN_INVITE_NOT_WRITTEN");
        const created = toInvite(row);

        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            ${actor.profileId}, ${actor.kind}, 'join_invite.created', 'join_invite', ${created.id},
            ${JSON.stringify({contactId: parsed.contactId, planCode: parsed.planCode})}::jsonb
          )
        `);
        return created;
      });
      return {invite, token};
    },

    async latestForContact(actor: Actor, contactId: unknown): Promise<(JoinInvite & {state: InviteState}) | null> {
      requireAdmin(actor);
      const id = uuidSchema.parse(contactId);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT ${INVITE_COLUMNS} FROM ${joinInvites}
        WHERE contact_id = ${id}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `))[0];
      if (!row) return null;
      const invite = toInvite(row);
      return {...invite, state: inviteState(invite, new Date())};
    },

    /**
     * Final review M3: does this raw token (from a link the admin's browser posts back) belong to
     * this invite AND this contact? Digest equality in Postgres, like `open`; a malformed value
     * answers false without a query. Admin only, read only.
     */
    async tokenBelongsTo(actor: Actor, input: Readonly<{token: unknown; inviteId: unknown; contactId: unknown}>): Promise<boolean> {
      requireAdmin(actor);
      const inviteId = uuidSchema.parse(input.inviteId);
      const contactId = uuidSchema.parse(input.contactId);
      if (!isWellFormedInviteToken(input.token)) return false;
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT id FROM ${joinInvites}
        WHERE token_digest = ${digestInviteToken(input.token)} AND id = ${inviteId} AND contact_id = ${contactId}
        LIMIT 1
      `))[0];
      return row !== undefined;
    },

    /**
     * Public: the invitee holds only the link. A value that is not token-shaped
     * returns before any connection is opened. The lookup is digest equality on
     * the unique index inside Postgres, so the raw token is never compared in
     * JavaScript and never logged; every "not usable" state (unknown, expired,
     * consumed, superseded) is the same null, so the response cannot be used to
     * probe which tokens exist.
     *
     * The first valid open stamps `opened_at` and writes one `invite_opened`
     * activity in one transaction; the UPDATE is guarded `opened_at IS NULL` so a
     * concurrent double open still records one.
     */
    async open(token: unknown): Promise<OpenedInvite | null> {
      const found = await lookupLive(token);
      if (!found) return null;
      const {database, parsed} = found;

      if (parsed.opened_at === null) {
        await database.transaction(async (transaction) => {
          const stamped = rowsFrom(await transaction.execute(sql`
            UPDATE ${joinInvites} SET opened_at = now()
            WHERE id = ${parsed.invite_id} AND opened_at IS NULL
            RETURNING id
          `))[0];
          if (!stamped) return;
          await insertContactActivity(transaction, {
            contactId: parsed.contact_id, actorProfileId: null, kind: "invite_opened",
            meta: {inviteId: parsed.invite_id},
          });
        });
      }

      return toOpenedInvite(parsed);
    },

    /**
     * The same invite as `open`, with no writes. The welcome page uses this: link unfurlers and mail
     * scanners fetch it the moment staff send the link, and only a deliberate Continue should count
     * as the lead opening it.
     */
    async peek(token: unknown): Promise<OpenedInvite | null> {
      const found = await lookupLive(token);
      return found ? toOpenedInvite(found.parsed) : null;
    },

    /** Form prefill for the join flow; the same liveness test as `open`, so a spent link prefills nothing. */
    async prefillFor(inviteId: unknown): Promise<InvitePrefill | null> {
      const parsedId = uuidSchema.safeParse(inviteId);
      if (!parsedId.success) return null;
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT c.display_name AS display_name, c.phone_e164 AS phone,
          (
            SELECT org.name FROM (
              SELECT nullif(btrim(g.organisation), '') AS name, g.created_at
              FROM ${eventGuestRegistrations} g
              WHERE g.contact_id = c.id
              UNION ALL
              SELECT nullif(btrim(l.organization), ''), l.created_at
              FROM ${leads} l
              WHERE l.contact_id = c.id
            ) org
            WHERE org.name IS NOT NULL
            ORDER BY org.created_at DESC
            LIMIT 1
          ) AS organisation
        FROM ${joinInvites} i
        INNER JOIN ${contacts} c ON c.id = i.contact_id
        WHERE i.id = ${parsedId.data}
          AND i.consumed_at IS NULL AND i.superseded_at IS NULL AND i.expires_at > now()
        LIMIT 1
      `))[0];
      if (!row) return null;
      const parsed = prefillRowSchema.parse(row);
      return {displayName: parsed.display_name, phone: parsed.phone, organisation: parsed.organisation};
    },

    /**
     * Final review I4: the fallback when the submit carries no `wtia_invite` cookie (the magic link
     * was opened in another browser or app). The newest LIVE invite whose contact's email equals the
     * signed-in profile's email, case-insensitively. The email is read from the profile row inside
     * the query, never taken from input, so a member can only ever find an invite addressed to
     * their own address. Member actor only; read only — `consume` does the spending.
     */
    async liveInviteIdForMember(actor: Actor): Promise<string | null> {
      if (actor.kind !== "member") forbidden();
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT i.id AS id
        FROM ${joinInvites} i
        INNER JOIN ${contacts} c ON c.id = i.contact_id
        INNER JOIN ${profiles} p ON p.id = ${actor.profileId}
        WHERE p.email IS NOT NULL AND c.email IS NOT NULL
          AND lower(c.email) = lower(p.email)
          AND i.consumed_at IS NULL AND i.superseded_at IS NULL AND i.expires_at > now()
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT 1
      `))[0];
      return row ? String(row.id) : null;
    },

    /**
     * The invitee's own application spends the invite. The actor must be a member
     * who OWNS the application; anything else is `"not_live"` with no writes,
     * so the answer never says whether an invite or application exists.
     *
     * The conditional UPDATE is the single-use guard: it matches only an
     * unconsumed, unsuperseded, unexpired invite, so of two concurrent
     * submissions exactly one gets a row back. Only then do the dependent writes
     * run, all in the same transaction.
     *
     * Ruling R-b: `contactsRepository.linkProfile` needs a contact-writer system
     * actor, so it is not called. The contact is linked to the signed-in profile
     * directly, and only when neither side is already linked (`profile_id IS NULL`
     * and no other contact holds this profile) — never a merge, never an
     * overwrite, which also keeps `contacts_profile_unique` from raising. The
     * stage moves forward only (`new|contacted|qualified` to `applied`); a
     * `member` or `closed` contact is left alone.
     */
    async consume(actor: Actor, input: unknown): Promise<"consumed" | "not_live"> {
      if (actor.kind !== "member") forbidden();
      const parsed = consumeInputSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        // FOR UPDATE: two consumes naming one application (two tabs, two invites) serialise here, so
        // the NOT EXISTS below sees the first one's write instead of both passing it.
        const owned = rowsFrom(await transaction.execute(sql`
          SELECT id FROM ${membershipApplications}
          WHERE id = ${parsed.applicationId} AND applicant_user_id = ${actor.profileId}
          FOR UPDATE
        `))[0];
        if (!owned) return "not_live";

        // Final review I1: one application, one invite. Abandon checkout, staff re-mint, the lead
        // resubmits the same application: without the NOT EXISTS the second invite would also be
        // spent on it and re-point `invite_id`, so both invites claimed one conversion.
        const spent = rowsFrom(await transaction.execute(sql`
          UPDATE ${joinInvites}
          SET consumed_at = now(), application_id = ${parsed.applicationId}
          WHERE id = ${parsed.inviteId}
            AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at > now()
            AND NOT EXISTS (SELECT 1 FROM ${joinInvites} other WHERE other.application_id = ${parsed.applicationId} AND other.id <> ${parsed.inviteId})
          RETURNING contact_id
        `))[0];
        if (!spent) return "not_live";
        const contactId = String(spent.contact_id);

        await transaction.execute(sql`
          UPDATE ${membershipApplications} SET invite_id = ${parsed.inviteId}
          WHERE id = ${parsed.applicationId}
        `);
        await transaction.execute(sql`
          UPDATE ${contacts}
          SET stage = 'applied', updated_at = now()
          WHERE id = ${contactId} AND stage IN ('new', 'contacted', 'qualified')
        `);
        // The link runs in a savepoint. `contacts_profile_unique` can still refuse it when another
        // contact claims this profile between the NOT EXISTS check and the write (23505); without the
        // savepoint that error aborts the whole transaction and the attribution is silently lost.
        // Skipping only the link keeps the consume, application, stage and audit writes.
        try {
          await (transaction as unknown as AutomationDatabase).transaction(async (savepoint) => {
            await savepoint.execute(sql`
              UPDATE ${contacts}
              SET profile_id = ${actor.profileId}, updated_at = now()
              WHERE id = ${contactId} AND profile_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM ${contacts} other WHERE other.profile_id = ${actor.profileId})
            `);
          });
        } catch (error) {
          const code = (error as {code?: unknown; cause?: {code?: unknown}} | null);
          if (code?.code !== "23505" && code?.cause?.code !== "23505") throw error;
        }
        await insertContactActivity(transaction, {
          contactId, actorProfileId: null, kind: "applied",
          meta: {inviteId: parsed.inviteId, applicationId: parsed.applicationId},
        });
        // A free-plan application is already active by the time the action reaches us:
        // `completeApplication` runs before attribution, and its own member flip found no contact
        // because this statement is what links one. So the invitee must go straight to `member` here,
        // forward-only over the funnel stages (never `closed`), with one timeline entry per real move.
        const active = rowsFrom(await transaction.execute(sql`
          SELECT 1 AS active FROM ${memberships}
          WHERE application_id = ${parsed.applicationId} AND status = 'active' LIMIT 1
        `))[0];
        if (active) {
          const moved = rowsFrom(await transaction.execute(sql`
            UPDATE ${contacts}
            SET stage = 'member', updated_at = now()
            WHERE id = ${contactId} AND stage IN ('new', 'contacted', 'qualified', 'applied')
            RETURNING id
          `))[0];
          if (moved) {
            await insertContactActivity(transaction, {
              contactId, actorProfileId: null, kind: "became_member",
              meta: {via: "invite", applicationId: parsed.applicationId},
            });
            // Parity with markMemberForProfile: every real move to member has its audit row.
            await transaction.execute(sql`
              INSERT INTO ${auditEvents}
                (actor_user_id, actor_type, action, target_type, target_id, metadata)
              VALUES (
                ${actor.profileId}, ${actor.kind}, 'contact.became_member', 'contact', ${contactId},
                ${JSON.stringify({via: "invite", applicationId: parsed.applicationId})}::jsonb
              )
            `);
          }
        }
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            ${actor.profileId}, ${actor.kind}, 'join_invite.consumed', 'join_invite', ${parsed.inviteId},
            ${JSON.stringify({contactId, applicationId: parsed.applicationId})}::jsonb
          )
        `);
        return "consumed";
      });
    },
  };
}

export const joinInvitesRepository = createJoinInvitesRepository();
export type JoinInvitesRepository = ReturnType<typeof createJoinInvitesRepository>;
