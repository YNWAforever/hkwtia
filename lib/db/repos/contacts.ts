import "server-only";

import {sql} from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  auditEvents,
  contactSourceEnum,
  contactStageEnum,
  contacts,
  conversations,
  profiles,
  staffTasks,
} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";
import {WOZTELL_MAX_MEMBER_ID_CHARS} from "@/lib/whatsapp/provider-field-limits";

/**
 * Public writers (interest form, Woztell webhook, guest RSVP in Phase B) never
 * hold a member/staff Actor. Like `unsubscribeActor()` they carry a capability
 * that only server code can mint, so a forged actor from a `"use server"`
 * boundary cannot reach this repository (programme rule §9).
 */
const contactWriterCapability: unique symbol = Symbol("contact-writer-capability");
export type ContactWriterSource = "interest_form" | "whatsapp" | "event_guest" | "showcase_intro" | "join_abandoned" | "import";
export type ContactWriterActor = Readonly<{kind: "contact-writer"; userId: null; source: ContactWriterSource; [contactWriterCapability]: true}>;

export function contactWriterActor(source: ContactWriterSource): ContactWriterActor {
  return Object.freeze({kind: "contact-writer", userId: null, source, [contactWriterCapability]: true as const});
}

function requireContactWriter(actor: unknown): asserts actor is ContactWriterActor {
  const candidate = actor as Partial<ContactWriterActor> | null;
  if (!candidate || candidate.kind !== "contact-writer" || candidate[contactWriterCapability] !== true) {
    throw new Error("FORBIDDEN");
  }
}

const interestInputSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().max(200).nullable(),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().regex(/^\+\d{8,15}$/).nullable(),
  whatsappOptIn: z.boolean(),
  // Where the consent was given (Phase B1 guest RSVP reuses this write). Recorded
  // only when opting in, so the value is auditable against the form that asked.
  consentSource: z.enum(["interest_form", "rsvp"]).optional().default("interest_form"),
}).strict();

const whatsappInputSchema = z.object({
  phoneE164: z.string().regex(/^\+\d{8,15}$/),
  locale: z.enum(["en", "zh-HK"]),
  receivedAt: z.coerce.date(),
  // C-1 review. The bound is still enforced here — this repository is also
  // reachable from C-3's backfill — but the NUMBER lives in
  // lib/whatsapp/provider-field-limits.ts, because the webhook normaliser has to
  // apply the same one before this parse can be reached. A `.max()` that threw
  // on a webhook payload was a 500, and a 500 is a Woztell retry loop for that
  // sender's message; the normaliser now reports an over-long id as absent, so
  // this line is a backstop for the second entry point rather than the gate.
  whatsappMemberId: z.string().trim().min(1).max(WOZTELL_MAX_MEMBER_ID_CHARS).nullable().optional().default(null),
}).strict();

/**
 * C-1 Task 4. `memberIdLink` is present only when the caller supplied a Woztell
 * member id, so a caller that does not care keeps the old two-field shape. It is
 * how the Woztell wiring learns that a link was REFUSED — the repository cannot
 * file the staff task itself without reaching across into another repository's
 * table, and a refusal nobody is told about is the same as no guard at all.
 */
export type ContactMemberIdLink = "linked" | "unchanged" | "conflict";
/**
 * C-1 Task 5. `"revoked"` means this call CHANGED the row's sendability and
 * wrote the one `consent.whatsapp.revoked` row for it — including the common
 * prospect case whose marketing flag was never true, whose withdrawal is
 * recorded by the timestamp alone (see `markWhatsAppOptedOut`).
 *
 * `"already_revoked"` means nothing changed, so nothing was audited: a Woztell
 * redelivery of the same STOP, a contact already withdrawn — and,
 * indistinguishably, a number no contact row carries at all. Read it as "no new
 * withdrawal to record here", never as proof that a contact-side withdrawal
 * exists. Telling those apart would cost a SELECT on the retry path for a
 * caller that does not exist: the STOP webhook upserts the contact from the
 * same inbound before it calls this (`lib/ai/woztell-webhook.ts`), so the
 * no-row case is unreachable from the only path that calls it today.
 */
export type ContactOptOutDisposition = "revoked" | "already_revoked";
export type ContactWriteResult = Readonly<{
  id: string;
  disposition: "upserted";
  memberIdLink?: ContactMemberIdLink;
}>;

/**
 * Programme C-4 / plan S-16. Which identity found the row, in the order spec
 * C-1 asks for: the Woztell member id first, because it is the provider's own
 * stable identity and survives a number change; then the number, which
 * `contacts_phone_unique` makes exact; then the email, which is deliberately
 * NOT unique (`contacts_email_idx`, and the reason is on `contactProjection`
 * below).
 */
export type ContactProfileMatch = "member_id" | "phone" | "email";
export type ContactProfileLink = Readonly<{
  /** The contact this call claimed, or null when it claimed nothing. */
  linked: string | null;
  matchedBy: ContactProfileMatch | null;
  /** Other rows sharing the identity, now tagged for a human to resolve. */
  candidates: readonly string[];
}>;

/** The tag `/admin/contacts` filters on to find the rows a human must merge. */
export const CONTACT_MERGE_CANDIDATE_TAG = "merge-candidate";
const CONTACT_MERGE_TASK_KIND = "contact_merge_candidate";

const NO_CONTACT_LINK: ContactProfileLink = Object.freeze({
  linked: null,
  matchedBy: null,
  candidates: Object.freeze([]) as readonly string[],
});

/**
 * C1's open question **O-3**. C1 writes `contacts.whatsapp_member_id` only when
 * the id is FREE, because `upsertFromWhatsApp` conflicts on `phone_e164` while
 * `contacts_whatsapp_member_unique` is a separate partial index and therefore
 * not a conflict target — an unguarded write raises 23505, which the webhook
 * route turns into a 500, which is an endless Woztell retry for that sender. The
 * consequence was that an id which landed on the wrong row could never be
 * corrected. This is the correction rule.
 *
 * `"conflict"` means "wrote nothing, a human must decide": either no row carries
 * the number at all, or the number's row already carries a DIFFERENT id. Two
 * identities on one number is exactly the case where guessing merges two
 * people's threads.
 */
export type ContactMemberIdDisposition = "unchanged" | "assigned" | "reassigned" | "conflict";
export type ContactMemberIdReconciliation = Readonly<{disposition: ContactMemberIdDisposition}>;

/**
 * Every field but `profileId` FAILS SOFT to null. The callers are the portal
 * profile save and the join profile step, both fire-and-forget (S-16: the link
 * never throws into a save the member already made), so a throw here is a merge
 * that silently never happens. A number that does not normalise is SKIPPED
 * rather than guessed at: `+90000000` and `+85290000000` are different people
 * and nothing in the tree validates a country code.
 */
const linkProfileSchema = z.object({
  profileId: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()).nullable().catch(null),
  phoneE164: z.string().trim().regex(/^\+\d{8,15}$/).nullable().catch(null),
  whatsappMemberId: z.string().trim().min(1).max(WOZTELL_MAX_MEMBER_ID_CHARS).nullable().catch(null),
}).strict();

type LinkProfileInput = z.infer<typeof linkProfileSchema>;

/**
 * No `.catch()` here, unlike the merge above: the callers are `/admin/contacts`
 * and (once this has landed) the webhook, both of which hold a normalised number
 * already. A malformed input is a bug to surface, not an identity to skip.
 */
const reconcileMemberIdSchema = z.object({
  whatsappMemberId: z.string().trim().min(1).max(WOZTELL_MAX_MEMBER_ID_CHARS),
  phoneE164: z.string().trim().regex(/^\+\d{8,15}$/),
}).strict();

/**
 * Programme C-4. The staff read surface, and the two fields staff own.
 *
 * The gate on everything below is `requireAdmin`, deliberately NOT the
 * `contactWriterActor` capability above. They are different principals answering
 * different questions: the capability says "a public form may create a row", and
 * `requireAdmin` says "a named person may reclassify one". Widening the
 * capability to cover staff — or adding a permissive branch to
 * `requireContactWriter` — would make the webhook's writer reachable with a
 * session actor, which is the whole reason the symbol exists (programme rule §9,
 * boundary 10).
 */
export const CONTACT_STAGES = contactStageEnum.enumValues;
export const CONTACT_SOURCES = contactSourceEnum.enumValues;
export type ContactStage = (typeof CONTACT_STAGES)[number];
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type ContactListFilters = Readonly<{
  stage: readonly ContactStage[];
  source: readonly ContactSource[];
  ownerProfileId: string | null;
  q: string;
  optIn: boolean | null;
  limit: number;
  cursor: string | null;
}>;

export type ContactRow = Readonly<{
  id: string;
  displayName: string | null;
  email: string | null;
  phoneE164: string | null;
  stage: ContactStage;
  source: ContactSource;
  ownerProfileId: string | null;
  ownerName: string | null;
  profileId: string | null;
  companyId: string | null;
  tags: readonly string[];
  whatsappOptIn: boolean;
  whatsappOptedOutAt: Date | null;
  lastInboundAt: Date | null;
  /** The newest thread this contact owns, for the inbox deep link. */
  conversationId: string | null;
  /** How many rows in the WHOLE table share this email, this one included. */
  duplicateCount: number;
  createdAt: Date;
}>;

export type ContactPage = Readonly<{
  items: readonly ContactRow[];
  nextCursor: string | null;
  total: number;
}>;

const contactIdSchema = z.string().uuid();

const listFiltersSchema = z.object({
  // Empty means "every stage", which is why the arrays default rather than
  // being nullable: a filter bar that submits nothing is not a filter that
  // matches nothing.
  stage: z.array(z.enum(CONTACT_STAGES)).max(CONTACT_STAGES.length).default([]),
  source: z.array(z.enum(CONTACT_SOURCES)).max(CONTACT_SOURCES.length).default([]),
  ownerProfileId: z.string().min(1).max(255).nullable().default(null),
  q: z.string().trim().max(200).default(""),
  optIn: z.boolean().nullable().default(null),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).nullable().default(null),
}).strict();

const updatePipelineSchema = z.object({
  stage: z.enum(CONTACT_STAGES).optional(),
  ownerProfileId: z.string().min(1).max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).strict();

const cursorSchema = z.object({createdAt: z.string(), id: z.string().uuid()}).strict();

const pipelineRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  phone_e164: z.string().nullable(),
  stage: z.enum(CONTACT_STAGES),
  source: z.enum(CONTACT_SOURCES),
  owner_profile_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  profile_id: z.string().nullable(),
  company_id: z.string().nullable(),
  tags: z.array(z.string()).nullable().transform((value) => value ?? []),
  whatsapp_opt_in: z.union([z.boolean(), z.string()]).nullable(),
  whatsapp_opted_out_at: z.coerce.date().nullable(),
  last_inbound_at: z.coerce.date().nullable(),
  conversation_id: z.string().nullable(),
  // `count(*)` is bigint, which both drivers hand back as a string.
  duplicate_count: z.coerce.number().int().nonnegative(),
  total_count: z.coerce.number().int().nonnegative(),
  created_at: z.coerce.date(),
});

function toContactRow(row: Record<string, unknown>): ContactRow {
  const parsed = pipelineRowSchema.parse(row);
  return {
    id: parsed.id,
    displayName: parsed.display_name,
    email: parsed.email,
    phoneE164: parsed.phone_e164,
    stage: parsed.stage,
    source: parsed.source,
    ownerProfileId: parsed.owner_profile_id,
    ownerName: parsed.owner_name,
    profileId: parsed.profile_id,
    companyId: parsed.company_id,
    tags: parsed.tags,
    whatsappOptIn: isTrue(parsed.whatsapp_opt_in),
    whatsappOptedOutAt: parsed.whatsapp_opted_out_at,
    lastInboundAt: parsed.last_inbound_at,
    conversationId: parsed.conversation_id,
    duplicateCount: parsed.duplicate_count,
    createdAt: parsed.created_at,
  };
}

function encodeCursor(row: ContactRow): string {
  return Buffer
    .from(JSON.stringify({createdAt: row.createdAt.toISOString(), id: row.id}), "utf8")
    .toString("base64url");
}

/**
 * The keyset predicate is PARENTHESISED. Today it is the sole `WHERE` term of
 * its query level, which is the only reason a bare `a < x OR (a = x AND b < y)`
 * would be safe — and the next filter added beside it would silently turn the
 * whole page into "everything older OR this narrow tail" (plan S-10 records the
 * same hazard on the segment audience cursor).
 */
function cursorPredicate(cursor: string | null): SQL {
  if (cursor === null || cursor === "") return sql`TRUE`;
  const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  const createdAt = new Date(parsed.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error("CONTACT_CURSOR_INVALID");
  return sql`(created_at < ${createdAt} OR (created_at = ${createdAt} AND id < ${parsed.id}))`;
}

function listPredicates(filters: ContactListFilters): SQL {
  const terms: SQL[] = [];
  if (filters.stage.length) {
    terms.push(sql`c.stage IN (${sql.join(filters.stage.map((stage) => sql`${stage}`), sql`, `)})`);
  }
  if (filters.source.length) {
    terms.push(sql`c.source IN (${sql.join(filters.source.map((source) => sql`${source}`), sql`, `)})`);
  }
  if (filters.ownerProfileId !== null) terms.push(sql`c.owner_profile_id = ${filters.ownerProfileId}`);
  if (filters.optIn !== null) terms.push(sql`c.whatsapp_opt_in = ${filters.optIn}`);
  if (filters.q !== "") {
    const pattern = `%${filters.q}%`;
    // Parenthesised for the same reason the cursor is: this term sits beside
    // the others under `AND`, and an unbracketed `OR` chain would widen the
    // whole filter to "anything matching the search" the moment a stage filter
    // was combined with it.
    terms.push(sql`(c.display_name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR c.phone_e164 ILIKE ${pattern})`);
  }
  return terms.length === 0 ? sql`TRUE` : sql.join(terms, sql` AND `);
}

/**
 * One projection, used by both `list` and `get`, so a row read on its own can
 * never disagree with the same row read in the table.
 *
 * `duplicate_count` is computed BEFORE the filters, because "how many rows share
 * this email" is a fact about the table and not about whatever the operator has
 * typed into the filter bar. A window over the filtered set would answer "one"
 * for a contact whose twin is at a different stage, which is precisely the case
 * the column exists to surface: `contacts_email_idx` is deliberately not unique
 * (an interest-form contact with no phone has no conflict target on email), so
 * duplicates are expected rather than a bug.
 *
 * `conversation_id` reads `conversations.contact_id` — C1's 0031 added it as a
 * nullable LINK, not an owner arm, because `conversations_owner_check` stays
 * two-armed with the HMAC as the owner key (spec D-6). Do not reach for the
 * owner columns here.
 */
function contactProjection(where: SQL): SQL {
  return sql`
    WITH email_groups AS (
      SELECT id,
        CASE
          WHEN email IS NULL THEN 1
          ELSE count(*) OVER (PARTITION BY lower(email))
        END AS duplicate_count
      FROM ${contacts}
    ),
    matched AS (
      SELECT c.id, c.display_name, c.email, c.phone_e164, c.stage, c.source,
        c.owner_profile_id, owner_profile.display_name AS owner_name,
        c.profile_id, c.company_id, c.tags, c.whatsapp_opt_in,
        c.whatsapp_opted_out_at, c.last_inbound_at, c.created_at,
        email_groups.duplicate_count,
        (
          SELECT thread.id FROM ${conversations} thread
          WHERE thread.contact_id = c.id AND thread.status <> 'deleted'
          ORDER BY thread.last_message_at DESC NULLS LAST, thread.id DESC
          LIMIT 1
        ) AS conversation_id
      FROM ${contacts} c
      LEFT JOIN ${profiles} owner_profile ON owner_profile.id = c.owner_profile_id
      INNER JOIN email_groups ON email_groups.id = c.id
      WHERE ${where}
    )
    SELECT matched.*, count(*) OVER () AS total_count FROM matched
  `;
}

/** `'{}'::text[]` rather than `ARRAY[]`, which Postgres cannot type on its own. */
function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function tagsFrom(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function duplicateKey(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "23505",
  );
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

/**
 * A Postgres `boolean` arrives as a JS boolean through both drivers this tree
 * uses, but a raw-SQL row is typed `unknown` and the pg-proxy fakes in the unit
 * suite hand back strings. Anything that is not demonstrably true is read as
 * false, which is the safe direction for a consent question: the cost of
 * misreading is a missing audit row, never a send to somebody who did not
 * consent (the send gate is `messageEligibilityRepository`, not this).
 */
function isTrue(value: unknown): boolean {
  return value === true || value === "true" || value === "t";
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createContactsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    /**
     * Interest form: a repeat submission with the same number refreshes consent;
     * never duplicates a phone.
     *
     * C2 Task 3 / boundary 11. The other half of C1's withdrawal leg: a GRANT is
     * a consent change too, and until now the only record of one was the row's
     * own `whatsapp_consent_*` columns, which a later submission overwrites.
     * `consent.whatsapp.granted` on the PROFILE side has existed since Phase A
     * (`lib/db/repos/profiles.ts`); the contact side — the majority of this
     * funnel — had nothing, which closes half of C1's open question O-4. The
     * re-consent FLOW for a withdrawn prospect is still unbuilt; a grant that
     * does happen is now audited.
     *
     * Only a TRANSITION is audited, exactly as `profilesRepository.update` does
     * it. Every interest form and every guest RSVP posts a `whatsappOptIn` value
     * because the checkbox is on the form either way, so auditing the value
     * rather than the change would mint a consent event for every repeat
     * submission, and a trail that says everything says nothing.
     *
     * The prior value is read with `SELECT … FOR UPDATE` inside the transaction,
     * before the upsert, which is the shape `profilesRepository.update` records
     * and NOT the "return the prior value from the upsert's RETURNING clause"
     * the plan proposed: a self-join or CTE reading the old row inside the
     * writing statement reads that statement's own pre-lock snapshot, so two
     * concurrent submissions for one number would both see `false` and both
     * audit. Taking the row lock first makes the loser re-read the committed
     * value and stay silent. The one case it cannot serialise is two first-ever
     * submissions of the SAME number arriving together: there is no row to lock
     * yet, so both may audit a grant. That is two genuine consent assertions
     * recorded twice rather than a consent we do not hold recorded once, which
     * is the direction to err in — and it is unreachable from a retry, unlike
     * the withdrawal leg, because these are user-initiated form posts and not a
     * webhook the route 500s on. Skipped entirely when the submission is not opting
     * in, because the merge below can then only preserve what is already there —
     * there is no false → true transition to miss, and the common path keeps its
     * single statement. That skip is safe for the READ but leaves `priorOptIn` a
     * hard-coded `false` rather than an observed value, so the condition consuming
     * it has to test that the read actually RAN before it trusts it; see the guard
     * on the audit INSERT below.
     *
     * The RESULTING flag is read back from `RETURNING`, not assumed from the
     * input: on a row carrying `whatsapp_opted_out_at` the merge forces `false`,
     * and auditing a grant that the revival guard just refused would be a
     * consent record for consent we do not hold.
     */
    async upsertFromInterestForm(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = interestInputSchema.parse(input);
      const consentAt = parsed.whatsappOptIn ? new Date() : null;
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const priorOptIn = parsed.whatsappOptIn && parsed.whatsappNumber !== null
          ? isTrue(rowsFrom(await transaction.execute(sql`
              SELECT ${contacts.whatsappOptIn} AS whatsapp_opt_in
              FROM ${contacts}
              WHERE ${contacts.phoneE164} = ${parsed.whatsappNumber}
              FOR UPDATE
            `))[0]?.whatsapp_opt_in)
          : false;
        // The ON CONFLICT target must repeat the partial index predicate verbatim
        // (contacts_phone_unique). An interest-form contact with no number has no
        // conflict target on email by design: email is not unique, one person may
        // register interest twice; the Phase C pipeline groups by email in the UI.
        const row = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${contacts}
            (email, display_name, locale, source, phone_e164, whatsapp_opt_in, whatsapp_consent_at, whatsapp_consent_source, whatsapp_consent_text_version)
          VALUES (
            ${parsed.email}, ${parsed.displayName}, ${parsed.locale}, ${actor.source},
            ${parsed.whatsappNumber}, ${parsed.whatsappOptIn}, ${consentAt},
            ${parsed.whatsappOptIn ? parsed.consentSource : null}, ${parsed.whatsappOptIn ? WHATSAPP_CONSENT_TEXT_VERSION : null}
          )
          ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
            email = COALESCE(${contacts.email}, EXCLUDED.email),
            display_name = COALESCE(EXCLUDED.display_name, ${contacts.displayName}),
            -- C-1 Task 5(b). This used to be a bare
            -- EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in, which never
            -- consulted whatsapp_opted_out_at — so a later interest form or guest
            -- RSVP carrying the same number silently re-opted-in somebody who had
            -- sent STOP, and nothing recorded that it had happened. A prior
            -- withdrawal now wins, and is cleared only by an explicit re-consent
            -- flow, which does not exist yet (open question O-4: C-4 owns it, and
            -- it must write consent.whatsapp.granted).
            whatsapp_opt_in = CASE
              WHEN ${contacts.whatsappOptedOutAt} IS NOT NULL THEN false
              ELSE EXCLUDED.whatsapp_opt_in OR ${contacts.whatsappOptIn}
            END,
            -- The same guard freezes the three consent EVIDENCE columns, because
            -- refreshing them on a row the CASE above has just forced to false
            -- leaves a consent timestamp NEWER than the withdrawal that beat it.
            -- Nothing reads them for a send decision today, so this is not a
            -- bypass — but C-4's re-consent flow (O-4) is precisely the code that
            -- will read them to decide whether this person ever came back, and it
            -- would have read that state as a yes.
            whatsapp_consent_at = CASE
              WHEN ${contacts.whatsappOptedOutAt} IS NOT NULL THEN ${contacts.whatsappConsentAt}
              ELSE COALESCE(EXCLUDED.whatsapp_consent_at, ${contacts.whatsappConsentAt})
            END,
            whatsapp_consent_source = CASE
              WHEN ${contacts.whatsappOptedOutAt} IS NOT NULL THEN ${contacts.whatsappConsentSource}
              ELSE COALESCE(EXCLUDED.whatsapp_consent_source, ${contacts.whatsappConsentSource})
            END,
            whatsapp_consent_text_version = CASE
              WHEN ${contacts.whatsappOptedOutAt} IS NOT NULL THEN ${contacts.whatsappConsentTextVersion}
              ELSE COALESCE(EXCLUDED.whatsapp_consent_text_version, ${contacts.whatsappConsentTextVersion})
            END,
            updated_at = now()
          RETURNING ${contacts.id} AS id, ${contacts.whatsappOptIn} AS whatsapp_opt_in
        `))[0];
        if (!row) throw new Error("CONTACT_UPSERT_FAILED");
        const id = String(row.id);
        // `parsed.whatsappOptIn` leads, and it is not redundant with the RETURNING
        // read. It is this call site's spelling of the arm
        // `profilesRepository.update` writes as `prior !== undefined`: the lock read
        // above is skipped on a DECLINING submission, so `priorOptIn` is then a
        // hard-coded `false` and not a prior value at all. A C2 review found the
        // consequence. A guest RSVPs with the marketing box unchecked but supplies a
        // number an opted-in contact already holds
        // (`lib/events/guest-registration-core.ts` posts
        // `marketingConsent && whatsappNumber !== null`; the interest form reaches the
        // same shape because `lib/growth/interest-service.ts` only rejects opt-in
        // WITHOUT a number). The merge is then `false OR true` = true, RETURNING hands
        // back that POST-update `true`, and `isTrue(true) && !false` minted one
        // `consent.whatsapp.granted` row per submission — a consent record attributed
        // to a form on which the person declined. Auditing a grant nobody made is the
        // one direction this leg must never err in, and it is worse than the missing
        // row it was added to fix.
        if (parsed.whatsappOptIn && isTrue(row.whatsapp_opt_in) && !priorOptIn) {
          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, metadata)
            VALUES (
              NULL, ${actor.kind}, 'consent.whatsapp.granted', 'contact', ${id},
              ${JSON.stringify({
                source: actor.source,
                consentSource: parsed.consentSource,
                consentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
              })}::jsonb
            )
          `);
        }
        return {id, disposition: "upserted"};
      });
    },

    /**
     * Unknown WhatsApp sender: stored to reply (D-6); marketing opt-in stays false.
     *
     * C-1 Task 4 took `whatsapp_member_id` OUT of this statement. The ON CONFLICT
     * target is `contacts_phone_unique`; `contacts_whatsapp_member_unique` is a
     * separate partial unique index and is therefore not a conflict target at
     * all. An inbound whose member id already belonged to a different phone row
     * raised 23505 here, which the webhook route turns into a 500, which makes
     * Woztell retry that sender's message forever — so the one identity we were
     * trying to record cost us every message from that sender.
     *
     * `source` is the ACTOR's, the way `upsertFromInterestForm` has always done
     * it, rather than a hard-coded `'whatsapp'`. The webhook passes
     * `contactWriterActor("whatsapp")` and is unchanged by that; C-3's backfill
     * passes `contactWriterActor("import")`, and its comment claimed the source
     * made a backfilled contact greppable in `contacts.source` at a time when
     * this statement ignored the actor entirely. Only the INSERT arm carries it:
     * the ON CONFLICT arm touches `last_inbound_at` alone, so importing a year of
     * history can never relabel a contact who arrived live.
     */
    async upsertFromWhatsApp(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = whatsappInputSchema.parse(input);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${contacts}
          (phone_e164, locale, source, last_inbound_at)
        VALUES (${parsed.phoneE164}, ${parsed.locale}, ${actor.source}, ${parsed.receivedAt})
        ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
          last_inbound_at = GREATEST(COALESCE(${contacts.lastInboundAt}, EXCLUDED.last_inbound_at), EXCLUDED.last_inbound_at),
          updated_at = now()
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      const id = String(row.id);
      if (!parsed.whatsappMemberId) return {id, disposition: "upserted"};
      return {
        id,
        disposition: "upserted",
        memberIdLink: await linkWhatsAppMemberId(database, id, parsed.whatsappMemberId),
      };
    },

    /**
     * D-7 / boundary 11. The audit row and the state change commit together or
     * neither does — copying `suppressionsRepository.optOutWhatsApp`, which was
     * the only consent writer in the tree that did this before Phase C. A
     * prospect with no profile never reaches that method, so before C-1 the
     * majority case for the funnel Phase C exists to serve had no audit trail
     * at all.
     *
     * Two guarded statements and one audit row. Each guard is what makes a
     * Woztell redelivery — the route 500s on a throw, so retries are routine —
     * a no-op rather than a second consent record for the same withdrawal.
     *
     * 1. The grant revoke, `WHERE whatsapp_opt_in = true`. Its COALESCE keeps
     *    the FIRST withdrawal timestamp instead of sliding it forward.
     * 2. Only if (1) matched nothing, the timestamp stamp,
     *    `WHERE whatsapp_opted_out_at IS NULL`. `contacts.whatsapp_opt_in` is
     *    `.default(false).notNull()` and `upsertFromWhatsApp` never sets it, so
     *    a prospect who says STOP almost always has the flag already false —
     *    this statement is the ONLY record their withdrawal gets, and it is the
     *    column `upsertFromInterestForm`'s revival guard reads. It is skipped
     *    after (1) because (1)'s COALESCE has already left a non-NULL value, so
     *    its guard could not match anyway.
     *
     * EITHER match writes the audit row, and this is the correction a review
     * caught: the plan's Task 5 Step 3 said to stamp the timestamp without
     * auditing it, on the reasoning that nothing granted was withdrawn. That is
     * the wrong fact to audit. A flag that was never granted is not the same
     * thing as a withdrawal that was never recorded, and after (2) the row's
     * sendability has materially changed — `messageEligibility` answers
     * `blocked/opted_out` for BOTH purposes where it answered `eligible` for a
     * service reply a moment earlier, and the interest form can no longer
     * re-opt this number in. A consent change with those consequences and no
     * row anywhere is exactly what a PDPO reviewer asks to see, and it was the
     * majority prospect shape. `clearedMarketingOptIn` keeps the two cases
     * apart inside the trail rather than by omitting half of it.
     */
    async markWhatsAppOptedOut(actor: unknown, phoneE164: string): Promise<ContactOptOutDisposition> {
      requireContactWriter(actor);
      const phone = z.string().regex(/^\+\d{8,15}$/).parse(phoneE164);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const revoked = rowsFrom(await transaction.execute(sql`
          UPDATE ${contacts}
          SET whatsapp_opt_in = false,
            whatsapp_opted_out_at = COALESCE(${contacts.whatsappOptedOutAt}, now()),
            updated_at = now()
          WHERE ${contacts.phoneE164} = ${phone} AND ${contacts.whatsappOptIn} = true
          RETURNING ${contacts.id} AS id
        `))[0];
        const stamped = revoked === undefined
          ? rowsFrom(await transaction.execute(sql`
              UPDATE ${contacts}
              SET whatsapp_opted_out_at = now(), updated_at = now()
              WHERE ${contacts.phoneE164} = ${phone} AND ${contacts.whatsappOptedOutAt} IS NULL
              RETURNING ${contacts.id} AS id
            `))[0]
          : undefined;
        const withdrawn = revoked ?? stamped;
        if (!withdrawn) return "already_revoked";
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'contact', ${String(withdrawn.id)},
            ${JSON.stringify({source: actor.source, reasonCode: "whatsapp_stop", clearedMarketingOptIn: revoked !== undefined})}::jsonb
          )
        `);
        return "revoked";
      });
    },

    /**
     * Programme C-4, plan S-16. Set `contacts.profile_id` when the identity that
     * would match it is WRITTEN — the portal profile save and the join profile
     * step — rather than "on login" as the spec line reads. `getActor()` fires
     * `touchLastLogin` on every authenticated request and not at login, so a
     * session hook would put this two-table lookup on every page render; the
     * identity it matches on only changes when somebody writes it.
     *
     * Precedence is member id → phone → email, which is the order spec C-1 asks
     * for and which neither Phase C plan implemented until now (C1's O-3). The
     * email arm is last AND narrower — `profile_id IS NULL`, oldest row first —
     * because `contacts_email_idx` is deliberately not unique: an interest-form
     * contact with no phone has no conflict target on email, so two rows sharing
     * an address is the expected shape rather than a fault.
     *
     * Everything runs in ONE transaction, and the whole of it is guarded:
     *
     * - the claim carries `AND profile_id IS NULL`, so a second call is a no-op
     *   instead of stealing a row from whichever profile reached it first;
     * - `contacts_profile_unique` is a partial unique index, so a profile that
     *   already owns a different contact row makes the claim raise 23505. That
     *   rolls the transaction back and is answered as "linked nothing" —
     *   a 500 here would surface as a failed profile save the member has already
     *   made, on a path that is deliberately fire-and-forget.
     *
     * The rows that matched the same identity but were not claimed are tagged
     * `merge-candidate` and reported in `candidates`, and one staff task is
     * raised for the profile so a human decides which row is really them.
     */
    async linkProfile(actor: unknown, input: unknown): Promise<ContactProfileLink> {
      requireContactWriter(actor);
      const parsed = linkProfileSchema.parse(input);
      // A profile with no matchable identity is the common case for a member who
      // never gave a number and whose email no prospect ever used. Answer it
      // without opening a connection: this runs on every profile save.
      if (parsed.whatsappMemberId === null && parsed.phoneE164 === null && parsed.email === null) {
        return NO_CONTACT_LINK;
      }
      const database = await loadDatabase();
      try {
        return await database.transaction(async (transaction) => {
          const matched = await matchContactIdentity(transaction, parsed);
          if (!matched) return NO_CONTACT_LINK;
          const claimed = rowsFrom(await transaction.execute(sql`
            UPDATE ${contacts}
            SET profile_id = ${parsed.profileId},
              -- A prospect who has become a member is no longer in the funnel.
              -- Only the funnel stages move: 'closed' was a decision somebody
              -- made and 'member' is already the answer.
              stage = CASE
                WHEN ${contacts.stage} IN ('new', 'contacted', 'qualified', 'applied') THEN 'member'
                ELSE ${contacts.stage}
              END,
              updated_at = now()
            WHERE ${contacts.id} = ${matched.id} AND ${contacts.profileId} IS NULL
            RETURNING ${contacts.id} AS id
          `))[0];
          if (!claimed) return NO_CONTACT_LINK;
          const id = String(claimed.id);
          const candidates = await tagMergeCandidates(transaction, parsed, id);
          if (candidates.length > 0) {
            // The direct INSERT shape `campaign-recipient-delivery.ts`,
            // `journeys.ts` and C1's `woztell-inbound-events.ts` use, for the
            // reasons C1's S-13 works through: `agentToolsRepository.createStaffTask`
            // parses `kind` against a closed `z.enum` of five `concierge_*` values
            // behind `requireConciergeAgent`, and `staffTasksRepository.createOnce`
            // throws `AUTOMATION_STAFF_TASK_PROFILE_REQUIRED` — neither can express
            // this task. `staff_tasks.kind` is free text and
            // `components/admin/task-table.tsx` renders it raw, so a new kind needs
            // no label map and no bundle string.
            //
            // One task per profile, and a plain `ON CONFLICT DO NOTHING` rather
            // than C1's retire-the-resolved-key dance: the claim above is a
            // one-shot, so this INSERT is reached at most once per profile in
            // practice and a resolved task cannot silently swallow a later one.
            await transaction.execute(sql`
              INSERT INTO ${staffTasks}
                (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
              VALUES (
                ${parsed.profileId}, NULL, ${CONTACT_MERGE_TASK_KIND},
                ${`contact-merge:${parsed.profileId}`}, ${CONTACT_MERGE_TASK_KIND},
                ${JSON.stringify({reasonCode: CONTACT_MERGE_TASK_KIND})}::jsonb
              )
              ON CONFLICT DO NOTHING
            `);
          }
          // Boundary 11's shape applied to an identity write: the link and the
          // record of what it matched on commit together or neither does. The
          // count rather than the ids — `candidates` are rows a reader can find
          // by their tag, and an audit row is not a place to copy addresses to.
          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, metadata)
            VALUES (
              NULL, ${actor.kind}, 'contact.linked', 'contact', ${id},
              ${JSON.stringify({
                profileId: parsed.profileId,
                matchedBy: matched.matchedBy,
                candidates: candidates.length,
              })}::jsonb
            )
          `);
          return {linked: id, matchedBy: matched.matchedBy, candidates};
        });
      } catch (error) {
        if (!duplicateKey(error)) throw error;
        return NO_CONTACT_LINK;
      }
    },

    /**
     * C1's O-3, closed. Move a Woztell member id onto the contact that now owns
     * the number it arrived with.
     *
     * The number is the stronger evidence: a member id follows a WhatsApp
     * account, and the account messaging us now is the one we must be able to
     * reply to. So a holder that no longer owns the number loses the id, in the
     * SAME transaction that assigns it — `contacts_whatsapp_member_unique` is
     * checked per statement and not at commit, so clearing second would raise
     * 23505 against ourselves.
     *
     * Nothing is written when the number's row already carries a different id,
     * or when no row carries the number at all. Both answer `"conflict"`, and
     * the caller files the staff task: guessing which of two identities owns a
     * number is how two people's threads merge.
     */
    async reconcileWhatsAppMemberId(actor: unknown, input: unknown): Promise<ContactMemberIdReconciliation> {
      requireContactWriter(actor);
      const parsed = reconcileMemberIdSchema.parse(input);
      const database = await loadDatabase();
      try {
        return await database.transaction(async (transaction) => {
          const holder = rowsFrom(await transaction.execute(sql`
            SELECT ${contacts.id} AS id
            FROM ${contacts}
            WHERE ${contacts.whatsappMemberId} = ${parsed.whatsappMemberId}
            FOR UPDATE
          `))[0];
          const target = rowsFrom(await transaction.execute(sql`
            SELECT ${contacts.id} AS id, ${contacts.whatsappMemberId} AS whatsapp_member_id
            FROM ${contacts}
            WHERE ${contacts.phoneE164} = ${parsed.phoneE164}
            FOR UPDATE
          `))[0];
          if (!target) return {disposition: "conflict"};
          const targetId = String(target.id);
          const held = target.whatsapp_member_id === null || target.whatsapp_member_id === undefined
            ? null
            : String(target.whatsapp_member_id);
          if (held === parsed.whatsappMemberId) return {disposition: "unchanged"};
          if (held !== null) return {disposition: "conflict"};
          const holderId = holder ? String(holder.id) : null;
          if (holderId !== null) {
            await transaction.execute(sql`
              UPDATE ${contacts}
              SET whatsapp_member_id = NULL, updated_at = now()
              WHERE ${contacts.id} = ${holderId}
            `);
          }
          await transaction.execute(sql`
            UPDATE ${contacts}
            SET whatsapp_member_id = ${parsed.whatsappMemberId}, updated_at = now()
            WHERE ${contacts.id} = ${targetId} AND ${contacts.whatsappMemberId} IS NULL
          `);
          if (holderId === null) return {disposition: "assigned"};
          // Only the MOVE is audited. Assigning a free id is what C1's guarded
          // write already does silently on every inbound; taking an identity off
          // a row it was already on is the correction somebody may later have to
          // explain.
          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, metadata)
            VALUES (
              NULL, ${actor.kind}, 'contact.member_id_reassigned', 'contact', ${targetId},
              ${JSON.stringify({from: holderId, to: targetId, whatsappMemberId: parsed.whatsappMemberId})}::jsonb
            )
          `);
          return {disposition: "reassigned"};
        });
      } catch (error) {
        // The race the two locked reads cannot close. A throw would be a 500 on
        // the webhook path this is destined for, and a 500 there is an endless
        // Woztell retry of a message we have already stored.
        if (!duplicateKey(error)) throw error;
        return {disposition: "conflict"};
      }
    },

    /**
     * C-4. The pipeline page's read. One statement: the total, the page and the
     * duplicate counts have to agree with each other, and three queries can
     * disagree between them.
     *
     * `total` is read off the returned rows, so an EXHAUSTED page (a cursor
     * pointing past the end, which only a hand-edited URL produces — `nextCursor`
     * is offered exactly when another row exists) reports `0`. Stated rather
     * than hidden: the alternative is a second count query on every render for a
     * case the UI cannot reach on its own.
     */
    async list(actor: Actor, filters: unknown): Promise<ContactPage> {
      requireAdmin(actor);
      const parsed = listFiltersSchema.parse(filters ?? {});
      // Both fragments are built BEFORE the connection: the cursor is decoded
      // here, not by the schema, and a hand-edited one throws — which should
      // cost nothing but a parse, the way an unknown stage does.
      const predicates = listPredicates(parsed);
      const keyset = cursorPredicate(parsed.cursor);
      const database = await loadDatabase();
      const rows = rowsFrom(await database.execute(sql`
        SELECT * FROM (${contactProjection(predicates)}) AS page
        WHERE ${keyset}
        ORDER BY created_at DESC, id DESC
        LIMIT ${parsed.limit + 1}
      `));
      const items = rows.slice(0, parsed.limit).map(toContactRow);
      const hasNext = rows.length > parsed.limit;
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: hasNext && last !== undefined ? encodeCursor(last) : null,
        total: items.length === 0 ? 0 : Number(rows[0]?.total_count ?? 0),
      };
    },

    async get(actor: Actor, id: unknown): Promise<ContactRow | null> {
      requireAdmin(actor);
      const contactId = contactIdSchema.parse(id);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT * FROM (${contactProjection(sql`c.id = ${contactId}`)}) AS one LIMIT 1
      `))[0];
      return row ? toContactRow(row) : null;
    },

    /**
     * C-4. The two fields staff own, plus tags, and the audit row that says who
     * moved a prospect and when.
     *
     * Only a TRANSITION is written, the shape `upsertFromInterestForm` above and
     * `profilesRepository.update` both use. The row form resubmits every field
     * on every save, so auditing the submitted VALUES rather than the changes
     * would mint a `contact.pipeline_updated` row each time an admin pressed
     * Save on an unchanged row — and a trail that records everything records
     * nothing. The prior row is taken `FOR UPDATE` first so two admins saving
     * the same contact together serialise: the loser re-reads the committed
     * value and stays silent rather than auditing a change the winner made.
     */
    async updatePipeline(actor: Actor, id: unknown, input: unknown): Promise<ContactRow> {
      requireAdmin(actor);
      const contactId = contactIdSchema.parse(id);
      const parsed = updatePipelineSchema.parse(input ?? {});
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const prior = rowsFrom(await transaction.execute(sql`
          SELECT ${contacts.id} AS id, ${contacts.stage} AS stage,
                 ${contacts.ownerProfileId} AS owner_profile_id, ${contacts.tags} AS tags
          FROM ${contacts} WHERE ${contacts.id} = ${contactId} FOR UPDATE
        `))[0];
        if (!prior) throw new Error("CONTACT_NOT_FOUND");

        const assignments: SQL[] = [];
        const changed: Record<string, unknown> = {};
        if (parsed.stage !== undefined && parsed.stage !== prior.stage) {
          assignments.push(sql`stage = ${parsed.stage}`);
          changed.stage = parsed.stage;
        }
        const priorOwner = typeof prior.owner_profile_id === "string" ? prior.owner_profile_id : null;
        if (parsed.ownerProfileId !== undefined && parsed.ownerProfileId !== priorOwner) {
          assignments.push(sql`owner_profile_id = ${parsed.ownerProfileId}`);
          changed.ownerProfileId = parsed.ownerProfileId;
        }
        const priorTags = tagsFrom(prior.tags);
        if (parsed.tags !== undefined && JSON.stringify(parsed.tags) !== JSON.stringify(priorTags)) {
          assignments.push(sql`tags = ${textArray(parsed.tags)}`);
          changed.tags = parsed.tags;
        }

        if (assignments.length > 0) {
          await transaction.execute(sql`
            UPDATE ${contacts}
            SET ${sql.join(assignments, sql`, `)}, updated_at = now()
            WHERE ${contacts.id} = ${contactId}
          `);
          // Boundary 11's shape, applied to a non-consent write: the change and
          // the record of who made it commit together or neither does.
          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, metadata)
            VALUES (
              ${actor.profileId}, ${actor.kind}, 'contact.pipeline_updated', 'contact', ${contactId},
              ${JSON.stringify(changed)}::jsonb
            )
          `);
        }

        const row = rowsFrom(await transaction.execute(sql`
          SELECT * FROM (${contactProjection(sql`c.id = ${contactId}`)}) AS one LIMIT 1
        `))[0];
        if (!row) throw new Error("CONTACT_NOT_FOUND");
        return toContactRow(row);
      });
    },
  };
}

/**
 * The second, separately guarded half of the member-id write. `NOT EXISTS`
 * refuses the id when another contact already holds it, so the partial unique
 * index is never reached in the ordinary case; the `try`/`catch` closes the
 * concurrent race that predicate cannot, because two inbound webhooks for the
 * same member arriving together both pass it. Neither path throws: a thrown
 * error here would be a 500 and an endless Woztell retry of a message we have
 * already stored.
 *
 * Read the return precisely. `"conflict"` is the 23505 race ONLY — the caller
 * files a staff task on it. The deterministic refusal, where another contact
 * demonstrably holds the id, returns `"unchanged"`, which is the same answer as
 * the overwhelmingly common "this contact already carries an id" and is
 * therefore silent. That is deliberate for C1 and not a shrug: C1 never reads
 * `contacts.whatsapp_member_id` (resolution stays number-first per O-3), so the
 * refusal has no functional consequence here, and two contacts claiming one
 * WhatsApp member is by definition a merge candidate — C2 Task 5's work, which
 * detects them by query rather than by hoping a webhook happened to notice one.
 * Anything that starts depending on the distinction must widen this return
 * rather than infer it from `"unchanged"`.
 *
 * `whatsapp_member_id IS NULL` means the first identity we learn wins, matching
 * the COALESCE the phone upsert uses: a later payload cannot overwrite it.
 */
async function linkWhatsAppMemberId(
  database: AutomationDatabase,
  id: string,
  memberId: string,
): Promise<ContactMemberIdLink> {
  try {
    const linked = rowsFrom(await database.execute(sql`
      UPDATE ${contacts}
      SET whatsapp_member_id = ${memberId}, updated_at = now()
      WHERE ${contacts.id} = ${id}
        AND ${contacts.whatsappMemberId} IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${contacts} AS other
          WHERE other.whatsapp_member_id = ${memberId}
        )
      RETURNING ${contacts.id} AS id
    `))[0];
    return linked ? "linked" : "unchanged";
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    return "conflict";
  }
}

/**
 * The precedence rule of `linkProfile`, as three guarded reads. Each takes the
 * row lock, so two saves racing for one contact serialise on the row rather than
 * both reaching the claim and one of them raising 23505.
 *
 * The phone and member-id arms do NOT filter on `profile_id IS NULL`: those
 * identities are exact, so a row already claimed by somebody else is a fact the
 * claim's own guard should refuse, not one to route around by silently linking
 * the next-best row. The email arm does filter, because email is not unique and
 * "the oldest unclaimed row with this address" is the most a non-unique
 * identity can honestly assert.
 */
async function matchContactIdentity(
  transaction: AutomationSqlExecutor,
  parsed: LinkProfileInput,
): Promise<Readonly<{id: string; matchedBy: ContactProfileMatch}> | null> {
  if (parsed.whatsappMemberId !== null) {
    const row = rowsFrom(await transaction.execute(sql`
      SELECT ${contacts.id} AS id
      FROM ${contacts}
      WHERE ${contacts.whatsappMemberId} = ${parsed.whatsappMemberId}
      FOR UPDATE
    `))[0];
    if (row) return {id: String(row.id), matchedBy: "member_id"};
  }
  if (parsed.phoneE164 !== null) {
    const row = rowsFrom(await transaction.execute(sql`
      SELECT ${contacts.id} AS id
      FROM ${contacts}
      WHERE ${contacts.phoneE164} = ${parsed.phoneE164}
      FOR UPDATE
    `))[0];
    if (row) return {id: String(row.id), matchedBy: "phone"};
  }
  if (parsed.email !== null) {
    const row = rowsFrom(await transaction.execute(sql`
      SELECT ${contacts.id} AS id
      FROM ${contacts}
      WHERE lower(${contacts.email}) = lower(${parsed.email})
        AND ${contacts.profileId} IS NULL
      ORDER BY ${contacts.createdAt}
      LIMIT 1
      FOR UPDATE
    `))[0];
    if (row) return {id: String(row.id), matchedBy: "email"};
  }
  return null;
}

/**
 * The rows that share the identity but were not claimed. They are tagged rather
 * than merged: deciding that two rows are one person is a judgement, and the
 * only cheap way to be wrong about it is to join two strangers' threads.
 *
 * The identity predicate is PARENTHESISED. It sits beside `id <> …` under
 * `AND`, so a bare `OR` chain would tag every row that matched either half of a
 * condition that was meant to be narrow — here, most of the table.
 *
 * `NOT (… = ANY(tags))` keeps the statement idempotent: a row already flagged is
 * neither rewritten nor re-reported, so a repeat can raise no second staff task.
 */
async function tagMergeCandidates(
  transaction: AutomationSqlExecutor,
  parsed: LinkProfileInput,
  linkedId: string,
): Promise<readonly string[]> {
  const identity: SQL[] = [];
  if (parsed.email !== null) identity.push(sql`lower(${contacts.email}) = lower(${parsed.email})`);
  if (parsed.phoneE164 !== null) identity.push(sql`${contacts.phoneE164} = ${parsed.phoneE164}`);
  if (identity.length === 0) return [];
  // `::text` on both, because `array_append` and `= ANY` are polymorphic over
  // `anyarray`/`anyelement`: an untyped bind parameter gives Postgres nothing to
  // resolve them against. The tag is a bound parameter rather than an inline
  // literal so that `CONTACT_MERGE_CANDIDATE_TAG` stays the single spelling the
  // admin filter and this writer share.
  const rows = rowsFrom(await transaction.execute(sql`
    UPDATE ${contacts}
    SET tags = array_append(${contacts.tags}, ${CONTACT_MERGE_CANDIDATE_TAG}::text), updated_at = now()
    WHERE ${contacts.id} <> ${linkedId}
      AND (${sql.join(identity, sql` OR `)})
      AND NOT (${CONTACT_MERGE_CANDIDATE_TAG}::text = ANY(${contacts.tags}))
    RETURNING ${contacts.id} AS id
  `));
  return rows.map((row) => String(row.id));
}

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
export const contactsRepository = createContactsRepository();
