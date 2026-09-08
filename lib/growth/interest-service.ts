import "server-only";

import {z} from "zod";

import {contactWriterActor, type ContactsRepository} from "@/lib/db/repos/contacts";
import type {RateLimiter} from "@/lib/security/rate-limit";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";

const interestInputSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(200),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().trim().max(32),
  whatsappOptIn: z.boolean(),
  website: z.string().trim(),
});

export type InterestResult = Readonly<{ok: true} | {ok: false; code: "invalid" | "rate_limited"}>;

export type InterestServiceDependencies = Readonly<{
  contacts: Pick<ContactsRepository, "upsertFromInterestForm">;
  limiter: RateLimiter;
  /** Injected so the service stays testable outside a request scope. */
  resolveClientIp: () => Promise<string | null>;
}>;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The "Get activity updates" band on /events used to link back to the empty
 * open-events list (audit F7). This turns it into the first contact-capturing
 * step of the funnel, shaped like lib/showcase/lead-actions.ts: honeypot,
 * validation, an IP-keyed limiter, then one repository write.
 */
export function createInterestService(dependencies: InterestServiceDependencies) {
  return Object.freeze({
    async submit(formData: FormData): Promise<InterestResult> {
      // Honeypot first, exactly as the showcase lead form: bots fill every field.
      if (textValue(formData, "website").trim().length > 0) return {ok: true};
      const parsed = interestInputSchema.safeParse({
        email: textValue(formData, "email"),
        displayName: textValue(formData, "displayName"),
        locale: textValue(formData, "locale"),
        whatsappNumber: textValue(formData, "whatsappNumber"),
        whatsappOptIn: formData.get("whatsappOptIn") === "on",
        website: textValue(formData, "website"),
      });
      if (!parsed.success) return {ok: false, code: "invalid"};

      const whatsappNumber = parsed.data.whatsappNumber ? normalizeWhatsAppNumber(parsed.data.whatsappNumber) : null;
      if (parsed.data.whatsappNumber && !whatsappNumber) return {ok: false, code: "invalid"};
      if (parsed.data.whatsappOptIn && !whatsappNumber) return {ok: false, code: "invalid"};

      // Keyed on the client, not the email: the email is attacker-chosen.
      const clientIp = await dependencies.resolveClientIp();
      const limiterKey = clientIp ? `interest:ip:${clientIp}` : `interest:email:${parsed.data.email.toLowerCase()}`;
      if (!dependencies.limiter.check(limiterKey).allowed) return {ok: false, code: "rate_limited"};

      await dependencies.contacts.upsertFromInterestForm(contactWriterActor("interest_form"), {
        email: parsed.data.email,
        displayName: parsed.data.displayName || null,
        locale: parsed.data.locale,
        whatsappNumber,
        whatsappOptIn: parsed.data.whatsappOptIn,
      });
      return {ok: true};
    },
  });
}

export type InterestService = ReturnType<typeof createInterestService>;
