import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {contacts} from "@/lib/db/server-schema";
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

export type ContactWriteResult = Readonly<{id: string; disposition: "upserted"}>;

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
          whatsapp_opt_in = EXCLUDED.whatsapp_opt_in OR ${contacts.whatsappOptIn},
          whatsapp_consent_at = COALESCE(EXCLUDED.whatsapp_consent_at, ${contacts.whatsappConsentAt}),
          whatsapp_consent_source = COALESCE(EXCLUDED.whatsapp_consent_source, ${contacts.whatsappConsentSource}),
          whatsapp_consent_text_version = COALESCE(EXCLUDED.whatsapp_consent_text_version, ${contacts.whatsappConsentTextVersion}),
          updated_at = now()
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      return {id: String(row.id), disposition: "upserted"};
    },

    /** Unknown WhatsApp sender: stored to reply (D-6); marketing opt-in stays false. */
    async upsertFromWhatsApp(actor: unknown, input: unknown): Promise<ContactWriteResult> {
      requireContactWriter(actor);
      const parsed = whatsappInputSchema.parse(input);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${contacts}
          (phone_e164, whatsapp_member_id, locale, source, last_inbound_at)
        VALUES (${parsed.phoneE164}, ${parsed.whatsappMemberId}, ${parsed.locale}, 'whatsapp', ${parsed.receivedAt})
        ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
          whatsapp_member_id = COALESCE(${contacts.whatsappMemberId}, EXCLUDED.whatsapp_member_id),
          last_inbound_at = GREATEST(COALESCE(${contacts.lastInboundAt}, EXCLUDED.last_inbound_at), EXCLUDED.last_inbound_at),
          updated_at = now()
        RETURNING ${contacts.id} AS id
      `))[0];
      if (!row) throw new Error("CONTACT_UPSERT_FAILED");
      return {id: String(row.id), disposition: "upserted"};
    },

    async markWhatsAppOptedOut(actor: unknown, phoneE164: string): Promise<void> {
      requireContactWriter(actor);
      const phone = z.string().regex(/^\+\d{8,15}$/).parse(phoneE164);
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${contacts}
        SET whatsapp_opt_in = false, whatsapp_opted_out_at = now(), updated_at = now()
        WHERE ${contacts.phoneE164} = ${phone}
      `);
    },
  };
}

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
export const contactsRepository = createContactsRepository();
