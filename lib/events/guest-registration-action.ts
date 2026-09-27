"use server";

import {randomUUID} from "node:crypto";
import {headers} from "next/headers";

import {appEnv, emailEnv, unsubscribeEnv} from "@/lib/config/env";
import {contactsRepository} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import {createGuestRegistrationService, type GuestRsvpResult} from "@/lib/events/guest-registration-core";
import {parseGuestRsvp} from "@/lib/events/guest-registration-input";
import {createSharedRateLimiter} from "@/lib/security/shared-rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {localizedPath} from "@/lib/urls";

/**
 * The Server Action boundary for the public guest RSVP form (programme B-4).
 * Only the formData wrapper is exported; it accepts nothing actor-shaped from
 * the caller and mints the guest capability itself inside the service.
 */
export async function submitGuestRsvpAction(formData: FormData): Promise<GuestRsvpResult> {
  // Preserve the existing honeypot behavior without touching required configuration.
  const website = formData.get("website");
  if (typeof website === "string" && website.trim()) return {ok: true, disposition: "registered"};
  const parsed = parseGuestRsvp(formData);
  if (!parsed.ok) return {ok: false, code: "invalid", fieldErrors: parsed.fieldErrors};

  let service: ReturnType<typeof createGuestRegistrationService>;
  try {
    const {appUrl} = appEnv();
    const email = emailEnv();
    const transport = createConfiguredEmailTransport(email);
    const secret = unsubscribeEnv().unsubscribeTokenSecret;
    service = createGuestRegistrationService({
      guests: eventGuestsRepository,
      contacts: contactsRepository,
      limiter: createSharedRateLimiter("guest-rsvp", process.env.RATE_LIMIT_KEY_SECRET ?? ""),
      resolveClientIp: async () => clientIpFromHeaders(await headers()),
      // The unsubscribe secret already keys one-click, mail-borne capabilities;
      // the cancel token shares its secret and rotation.
      secret,
      appUrl,
      async sendConfirmation(confirmation) {
        const rendered = await renderEmail({
          template: confirmation.disposition === "waitlist" ? "event_guest_waitlist" : "event_guest_confirmation",
          locale: confirmation.locale,
          recipientName: confirmation.name,
          classification: "transactional",
          variables: {
            eventTitle: confirmation.eventTitle,
            ctaUrl: `${appUrl}${localizedPath(confirmation.locale, `/events/${confirmation.slug}`)}`,
            cancelUrl: confirmation.cancelUrl,
          },
        });
        await transport.send({
          to: confirmation.to,
          from: email.emailFrom,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: rendered.headers,
          idempotencyKey: `guest-rsvp:${confirmation.registrationId}:${confirmation.cancelTokenDigest.slice(0, 12)}`,
        });
      },
    });
  } catch (error) {
    const errorId = randomUUID();
    console.error("guest-rsvp-init", errorId, error instanceof Error ? error.name : "unknown");
    return {ok: false, code: "unavailable", errorId};
  }

  try {
    return await service.submit(formData);
  } catch (error) {
    // Service-level unexpected failures occur before registration; notification failures
    // after a saved registration are handled as confirmation_pending inside the service.
    const errorId = randomUUID();
    console.error("guest-rsvp-submit", errorId, error instanceof Error ? error.name : "unknown");
    return {ok: false, code: "unavailable", errorId};
  }
}