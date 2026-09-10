import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, contacts} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

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
  whatsappMemberId: z.string().trim().min(1).max(200).nullable().optional().default(null),
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
 * C-1 Task 5. `"already_revoked"` covers both retries of the same STOP and the
 * common prospect case whose marketing flag was never true — see
 * `markWhatsAppOptedOut`. Either way no second `consent.whatsapp.revoked` row
 * is written, which is what the caller needs to know.
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
          whatsapp_consent_at = COALESCE(EXCLUDED.whatsapp_consent_at, ${contacts.whatsappConsentAt}),
          whatsapp_consent_source = COALESCE(EXCLUDED.whatsapp_consent_source, ${contacts.whatsappConsentSource}),
          whatsapp_consent_text_version = COALESCE(EXCLUDED.whatsapp_consent_text_version, ${contacts.whatsappConsentTextVersion}),
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
     */
    async upsertFromWhatsApp(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = whatsappInputSchema.parse(input);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${contacts}
          (phone_e164, locale, source, last_inbound_at)
        VALUES (${parsed.phoneE164}, ${parsed.locale}, 'whatsapp', ${parsed.receivedAt})
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
     * D-7 / boundary 11. The audit row and the flag commit together or neither
     * does — copying `suppressionsRepository.optOutWhatsApp`, which was the only
     * consent writer in the tree that did this before Phase C. A prospect with
     * no profile never reaches that method, so before C-1 the majority case for
     * the funnel Phase C exists to serve had no audit trail at all.
     *
     * Three statements, in this order, and the order is the point.
     *
     * 1. The unguarded timestamp back-fill. `contacts.whatsapp_opt_in` is
     *    `.default(false).notNull()` and `upsertFromWhatsApp` never sets it, so
     *    a prospect who says STOP almost always has the flag already false and
     *    a NULL `whatsapp_opted_out_at`. Without this statement the withdrawal
     *    would leave no timestamp, and `upsertFromInterestForm`'s revival guard
     *    reads exactly that column. It writes no audit row: nothing was
     *    withdrawn here that had ever been granted.
     * 2. The guarded flag update, `WHERE whatsapp_opt_in = true`. The webhook
     *    route 500s on a throw, which makes Woztell retries routine, so an
     *    unguarded UPDATE would write one consent row per redelivery of the
     *    same withdrawal.
     * 3. The audit row, only when step 2 actually revoked something.
     */
    async markWhatsAppOptedOut(actor: unknown, phoneE164: string): Promise<ContactOptOutDisposition> {
      requireContactWriter(actor);
      const phone = z.string().regex(/^\+\d{8,15}$/).parse(phoneE164);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          UPDATE ${contacts}
          SET whatsapp_opted_out_at = now(), updated_at = now()
          WHERE ${contacts.phoneE164} = ${phone} AND ${contacts.whatsappOptedOutAt} IS NULL
        `);
        const row = rowsFrom(await transaction.execute(sql`
          UPDATE ${contacts}
          SET whatsapp_opt_in = false,
            whatsapp_opted_out_at = COALESCE(${contacts.whatsappOptedOutAt}, now()),
            updated_at = now()
          WHERE ${contacts.phoneE164} = ${phone} AND ${contacts.whatsappOptIn} = true
          RETURNING ${contacts.id} AS id
        `))[0];
        if (!row) return "already_revoked";
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'contact', ${String(row.id)},
            ${JSON.stringify({source: actor.source, reasonCode: "whatsapp_stop"})}::jsonb
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
