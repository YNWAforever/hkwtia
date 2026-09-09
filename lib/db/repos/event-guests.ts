import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {contactWriterActor, type ContactWriterActor} from "@/lib/db/repos/contacts";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {auditEvents, eventGuestRegistrations, eventRegistrations, events} from "@/lib/db/server-schema";

const guestInputSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().regex(/^\+\d{8,15}$/).nullable(),
  organisation: z.string().trim().max(200).nullable(),
  marketingConsent: z.boolean(),
  idempotencyKey: z.string().min(8).max(200),
  cancelTokenDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export type GuestRegistrationInput = z.input<typeof guestInputSchema>;
export type GuestRegistrationDisposition = "registered" | "waitlist" | "already_registered";
/** `eventTitle` and `slug` are read from the locked row so the confirmation email never trusts a form field for either. */
export type GuestRegistrationResult = Readonly<{id: string; disposition: GuestRegistrationDisposition; eventTitle: string; slug: string}>;

/**
 * Narrower than `requireContactWriter` in contacts.ts: the capability symbol
 * proves the actor was minted by server code, and the source pins it to the
 * guest-RSVP path, so an interest-form or webhook writer cannot register guests.
 * The symbol is private to contacts.ts, so it is recovered from a freshly
 * minted probe rather than imported.
 */
function requireGuestWriter(actor: unknown): asserts actor is ContactWriterActor {
  const probe = contactWriterActor("event_guest");
  const symbols = Object.getOwnPropertySymbols(probe);
  const candidate = actor as Record<string | symbol, unknown> | null;
  if (
    !candidate
    || typeof candidate !== "object"
    || candidate.kind !== "contact-writer"
    || candidate.source !== "event_guest"
    || symbols.length === 0
    || !symbols.every((symbol) => candidate[symbol] === true)
  ) {
    throw new Error("FORBIDDEN");
  }
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createEventGuestsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader, now: () => Date = () => new Date()) {
  return {
    /** Capability-gated public write. Order: event gate → capacity → upsert, all in one transaction. */
    async register(actor: unknown, input: unknown): Promise<GuestRegistrationResult> {
      requireGuestWriter(actor);
      const parsed = guestInputSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const event = rowsFrom(await transaction.execute(sql`
          SELECT id, slug, title_en, title_zh, status, visibility, registration_mode, capacity, starts_at, ends_at
          FROM ${events} WHERE ${events.id} = ${parsed.eventId} FOR UPDATE
        `))[0];
        // A guest sees exactly what the public page shows (S-1); anything else is not-found, not forbidden.
        if (!event || event.status !== "published" || event.visibility !== "public") throw new Error("EVENT_NOT_FOUND");
        if (event.registration_mode === "external") throw new Error("EVENT_REGISTRATION_EXTERNAL");
        if (event.registration_mode === "ticketed") throw new Error("EVENT_REGISTRATION_TICKETED");
        const boundary = new Date(String(event.ends_at ?? event.starts_at));
        if (boundary < now()) throw new Error("EVENT_REGISTRATION_CLOSED");
        const eventTitle = parsed.locale === "zh-HK" && typeof event.title_zh === "string" && event.title_zh.length > 0 ? event.title_zh : String(event.title_en ?? "");
        const slug = String(event.slug ?? "");

        // Capacity counts members and guests together; the row lock above serialises the check.
        const taken = Number(rowsFrom(await transaction.execute(sql`
          SELECT (SELECT count(*) FROM ${eventRegistrations} r WHERE r.event_id = ${parsed.eventId} AND r.status IN ('registered', 'attended'))
               + (SELECT count(*) FROM ${eventGuestRegistrations} g WHERE g.event_id = ${parsed.eventId} AND g.status IN ('registered', 'attended')) AS count
        `))[0]?.count ?? 0);
        const status = event.capacity !== null && event.capacity !== undefined && taken >= Number(event.capacity) ? "waitlist" : "registered";

        // A repeat RSVP from the same email is a replay, not a second seat. The
        // existing row is read under lock rather than inferred from the upsert:
        // an earlier `xmax = 0` probe reported a revived cancellation as a replay,
        // so the guest never received the cancel link for their new token.
        const existing = rowsFrom(await transaction.execute(sql`
          SELECT id, status FROM ${eventGuestRegistrations}
          WHERE ${eventGuestRegistrations.eventId} = ${parsed.eventId} AND ${eventGuestRegistrations.email} = ${parsed.email} FOR UPDATE
        `))[0];
        if (existing && existing.status !== "cancelled") {
          return {id: String(existing.id), disposition: "already_registered", eventTitle, slug};
        }

        // Fresh insert, or a cancelled row revived with the new token and details.
        const row = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${eventGuestRegistrations}
            (event_id, name, email, whatsapp_number, organisation, locale, status, marketing_consent_at, cancel_token_digest, idempotency_key)
          VALUES (${parsed.eventId}, ${parsed.name}, ${parsed.email}, ${parsed.whatsappNumber}, ${parsed.organisation}, ${parsed.locale}, ${status},
                  ${parsed.marketingConsent ? now() : null}, ${parsed.cancelTokenDigest}, ${parsed.idempotencyKey})
          ON CONFLICT (event_id, email) DO UPDATE SET
            name = EXCLUDED.name,
            whatsapp_number = EXCLUDED.whatsapp_number,
            organisation = EXCLUDED.organisation,
            locale = EXCLUDED.locale,
            status = EXCLUDED.status,
            cancelled_at = NULL,
            cancel_token_digest = EXCLUDED.cancel_token_digest,
            idempotency_key = EXCLUDED.idempotency_key,
            marketing_consent_at = COALESCE(EXCLUDED.marketing_consent_at, ${eventGuestRegistrations.marketingConsentAt}),
            updated_at = now()
          RETURNING id, status
        `))[0];
        if (!row) throw new Error("GUEST_REGISTRATION_FAILED");
        const id = String(row.id);
        const disposition: GuestRegistrationDisposition = row.status === "waitlist" ? "waitlist" : "registered";

        // Same transaction as the write: a registration without its audit row is
        // exactly the gap the funnel reports cannot explain later.
        await transaction.execute(sql`
          INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (NULL, 'contact-writer', 'event.guest.registered', 'event_guest_registration', ${id},
                  ${JSON.stringify({eventId: parsed.eventId, status: disposition})}::jsonb)
        `);
        return {id, disposition, eventTitle, slug};
      });
    },

    async cancelByToken(actor: unknown, cancelTokenDigest: string): Promise<"cancelled" | "unknown"> {
      requireGuestWriter(actor);
      const digest = digestSchema.parse(cancelTokenDigest);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${eventGuestRegistrations} SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE ${eventGuestRegistrations.cancelTokenDigest} = ${digest} AND ${eventGuestRegistrations.status} <> 'cancelled'
        RETURNING id
      `))[0];
      return row ? "cancelled" : "unknown";
    },
  };
}

export type EventGuestsRepository = ReturnType<typeof createEventGuestsRepository>;
export const eventGuestsRepository = createEventGuestsRepository();
