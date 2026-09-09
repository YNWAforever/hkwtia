import "server-only";

import {createHmac, randomUUID} from "node:crypto";
import {z} from "zod";

import {contactWriterActor, type ContactsRepository} from "@/lib/db/repos/contacts";
import type {EventGuestsRepository, GuestRegistrationDisposition} from "@/lib/db/repos/event-guests";
import type {RateLimiter} from "@/lib/security/rate-limit";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";

const inputSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().trim().max(32),
  organisation: z.string().trim().max(200),
  marketingConsent: z.boolean(),
  website: z.string().trim(),
});

export type GuestRsvpResult = Readonly<
  | {ok: true; disposition: GuestRegistrationDisposition}
  | {ok: false; code: "invalid" | "rate_limited" | "closed" | "external" | "unavailable"}
>;

export type GuestConfirmation = Readonly<{
  to: string;
  name: string;
  locale: "en" | "zh-HK";
  /** From the locked event row, never the form: the CTA link must point at the event that was actually written. */
  slug: string;
  eventTitle: string;
  disposition: Exclude<GuestRegistrationDisposition, "already_registered">;
  /** Registration id plus the digest of the token in `cancelUrl`; keys the email so a re-registration after cancel still sends its new link. */
  registrationId: string;
  cancelTokenDigest: string;
  cancelUrl: string;
}>;

export type GuestRegistrationDependencies = Readonly<{
  guests: Pick<EventGuestsRepository, "register">;
  contacts: Pick<ContactsRepository, "upsertFromInterestForm">;
  limiter: RateLimiter;
  /** Injected so the service stays testable outside a request scope. */
  resolveClientIp: () => Promise<string | null>;
  sendConfirmation: (confirmation: GuestConfirmation) => Promise<void>;
  /** HMAC key for cancel tokens; the unsubscribe secret is reused because both are one-click, mail-borne capabilities. */
  secret: string;
  appUrl: string;
}>;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Cancel tokens are random; only their HMAC digest is stored, so a database read cannot cancel on a guest's behalf. */
export function cancelTokenDigest(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Anonymous RSVP (programme B-4), shaped like lib/growth/interest-service.ts:
 * honeypot, validation, an IP-keyed limiter, then the capability-gated
 * repository write. The event title in the confirmation comes back from the
 * locked event row, never from the form.
 */
export function createGuestRegistrationService(dependencies: GuestRegistrationDependencies) {
  return Object.freeze({
    async submit(formData: FormData): Promise<GuestRsvpResult> {
      // Honeypot first, exactly as the interest form: bots fill every field.
      if (textValue(formData, "website").trim().length > 0) return {ok: true, disposition: "registered"};
      const parsed = inputSchema.safeParse({
        eventId: textValue(formData, "eventId"),
        name: textValue(formData, "name"),
        email: textValue(formData, "email"),
        locale: textValue(formData, "locale"),
        whatsappNumber: textValue(formData, "whatsappNumber"),
        organisation: textValue(formData, "organisation"),
        marketingConsent: formData.get("marketingConsent") === "on",
        website: textValue(formData, "website"),
      });
      if (!parsed.success) return {ok: false, code: "invalid"};
      const whatsappNumber = parsed.data.whatsappNumber ? normalizeWhatsAppNumber(parsed.data.whatsappNumber) : null;
      if (parsed.data.whatsappNumber && !whatsappNumber) return {ok: false, code: "invalid"};

      // Keyed on the client, not the email: the email is attacker-chosen.
      const clientIp = await dependencies.resolveClientIp();
      const email = parsed.data.email.toLowerCase();
      const limiterKey = clientIp ? `guest-rsvp:ip:${clientIp}` : `guest-rsvp:email:${email}`;
      if (!dependencies.limiter.check(limiterKey).allowed) return {ok: false, code: "rate_limited"};

      const token = randomUUID().replace(/-/g, "");
      const digest = cancelTokenDigest(dependencies.secret, token);
      const actor = contactWriterActor("event_guest");
      let result;
      try {
        result = await dependencies.guests.register(actor, {
          eventId: parsed.data.eventId,
          name: parsed.data.name,
          email,
          locale: parsed.data.locale,
          whatsappNumber,
          organisation: parsed.data.organisation || null,
          marketingConsent: parsed.data.marketingConsent,
          idempotencyKey: `guest:${parsed.data.eventId}:${email}`,
          cancelTokenDigest: digest,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "EVENT_REGISTRATION_CLOSED") return {ok: false, code: "closed"};
        if (message === "EVENT_REGISTRATION_EXTERNAL" || message === "EVENT_REGISTRATION_TICKETED") return {ok: false, code: "external"};
        if (message === "EVENT_NOT_FOUND") return {ok: false, code: "unavailable"};
        // A Server Action that throws hands the browser an opaque error page; the
        // form knows how to render `unavailable`, so an outage degrades to that.
        console.error("guest-rsvp", error);
        return {ok: false, code: "unavailable"};
      }

      // The contact is the funnel spine (D-6); its failure must not undo a registration.
      await dependencies.contacts.upsertFromInterestForm(actor, {
        email,
        displayName: parsed.data.name,
        locale: parsed.data.locale,
        whatsappNumber,
        whatsappOptIn: parsed.data.marketingConsent && whatsappNumber !== null,
        consentSource: "rsvp",
      }).catch(() => undefined);

      // A replayed RSVP keeps its original token; the stored digest was not replaced,
      // so a second email would carry a link that cancels nothing.
      if (result.disposition !== "already_registered") {
        await dependencies.sendConfirmation({
          to: email,
          name: parsed.data.name,
          locale: parsed.data.locale,
          slug: result.slug,
          eventTitle: result.eventTitle,
          disposition: result.disposition,
          registrationId: result.id,
          cancelTokenDigest: digest,
          cancelUrl: `${dependencies.appUrl}/api/events/guest/cancel?token=${token}`,
        }).catch(() => undefined);
      }
      return {ok: true, disposition: result.disposition};
    },
  });
}

export type GuestRegistrationService = ReturnType<typeof createGuestRegistrationService>;
