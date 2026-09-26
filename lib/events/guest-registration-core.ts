import "server-only";

import {createHmac, randomUUID, timingSafeEqual} from "node:crypto";

import {contactWriterActor, type ContactsRepository} from "@/lib/db/repos/contacts";
import type {EventGuestsRepository, GuestRegistrationDisposition} from "@/lib/db/repos/event-guests";
import type {RateLimiter} from "@/lib/security/rate-limit";
import {parseGuestRsvp, type GuestRsvpFieldErrors} from "@/lib/events/guest-registration-input";

export type GuestRsvpResult = Readonly<
  | {ok: true; disposition: GuestRegistrationDisposition | "confirmation_pending"}
  | {ok: false; code: "invalid"; fieldErrors: GuestRsvpFieldErrors}
  | {ok: false; code: "unavailable"; errorId?: string}
  | {ok: false; code: "rate_limited" | "closed" | "external"}
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

function cancelSignature(secret: string, digest: string): string {
  return createHmac("sha256", secret).update("guest-cancel-v2:" + digest).digest("hex");
}

/** The signed digest can be reconstructed for email retries without storing a raw cancellation token. */
export function signedGuestCancelToken(secret: string, digest: string): string {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("INVALID_CANCEL_DIGEST");
  return digest + "." + cancelSignature(secret, digest);
}

export function cancelDigestFromToken(secret: string, token: string): string | null {
  // Links already mailed before the confirm-POST change remain usable.
  if (/^[0-9a-f]{32}$/.test(token)) return cancelTokenDigest(secret, token);
  if (!/^[0-9a-f]{64}\.[0-9a-f]{64}$/.test(token)) return null;
  const digest = token.slice(0, 64);
  const supplied = Buffer.from(token.slice(65), "hex");
  const expected = Buffer.from(cancelSignature(secret, digest), "hex");
  return timingSafeEqual(supplied, expected) ? digest : null;
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
      const parsed = parseGuestRsvp(formData);
      if (!parsed.ok) return {ok: false, code: "invalid", fieldErrors: parsed.fieldErrors};
      const whatsappNumber = parsed.data.normalizedWhatsAppNumber;
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
        const errorId = randomUUID();
        console.error("guest-rsvp-register", errorId, error instanceof Error ? error.name : "unknown");
        return {ok: false, code: "unavailable", errorId};
      }

      // The contact is the funnel spine (D-6); its failure must not undo a registration.
      try {
        await dependencies.contacts.upsertFromInterestForm(actor, {
          email,
          displayName: parsed.data.name,
          locale: parsed.data.locale,
          whatsappNumber,
          whatsappOptIn: parsed.data.marketingConsent && whatsappNumber !== null,
          consentSource: "rsvp",
        });
      } catch {
        // The registration is committed; contact enrichment cannot invalidate it.
      }
      // A signed digest is reproducible from the stored row for a failed email retry.
      // The transport uses the same idempotency key if an earlier send did reach it.
      if (result.status !== "attended") {
        try {
          const cancelUrl = new URL("/api/events/guest/cancel", dependencies.appUrl);
          cancelUrl.searchParams.set("token", signedGuestCancelToken(dependencies.secret, result.cancelTokenDigest));
          cancelUrl.searchParams.set("locale", parsed.data.locale);
          await dependencies.sendConfirmation({
            to: email,
            name: parsed.data.name,
            locale: parsed.data.locale,
            slug: result.slug,
            eventTitle: result.eventTitle,
            disposition: result.status,
            registrationId: result.id,
            cancelTokenDigest: result.cancelTokenDigest,
            cancelUrl: cancelUrl.toString(),
          });
        } catch {
          // The registration is saved. A repeat submit reuses its idempotency key and cancellation digest.
          return {ok: true, disposition: "confirmation_pending"};
        }
      }
      return {ok: true, disposition: result.disposition};
    },
  });
}

export type GuestRegistrationService = ReturnType<typeof createGuestRegistrationService>;
