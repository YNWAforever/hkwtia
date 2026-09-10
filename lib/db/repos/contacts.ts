import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, contacts} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
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

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createContactsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    /** Interest form: a repeat submission with the same number refreshes consent; never duplicates a phone. */
    async upsertFromInterestForm(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = interestInputSchema.parse(input);
      const consentAt = parsed.whatsappOptIn ? new Date() : null;
      const database = await loadDatabase();
      // The ON CONFLICT target must repeat the partial index predicate verbatim
      // (contacts_phone_unique). An interest-form contact with no number has no
      // conflict target on email by design: email is not unique, one person may
      // register interest twice; the Phase C pipeline groups by email in the UI.
      const row = rowsFrom(await database.execute(sql`
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
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      return {id: String(row.id), disposition: "upserted"};
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

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
export const contactsRepository = createContactsRepository();
