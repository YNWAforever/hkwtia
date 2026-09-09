"use server";

import {headers} from "next/headers";

import {appEnv, emailEnv, unsubscribeEnv} from "@/lib/config/env";
import {contactsRepository} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import {createGuestRegistrationService, type GuestRsvpResult} from "@/lib/events/guest-registration-core";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {localizedPath} from "@/lib/urls";

// Process-local, mirroring lib/growth/interest-action.ts.
const guestRateLimiter = createInMemoryRateLimiter({limit: 5, windowMs: 15 * 60_000});

/**
 * The Server Action boundary for the public guest RSVP form (programme B-4).
 * Only the formData wrapper is exported; it accepts nothing actor-shaped from
 * the caller and mints the guest capability itself inside the service.
 */
export async function submitGuestRsvpAction(formData: FormData): Promise<GuestRsvpResult> {
  const {appUrl} = appEnv();
  const email = emailEnv();
  const transport = createConfiguredEmailTransport(email);
  const service = createGuestRegistrationService({
    guests: eventGuestsRepository,
    contacts: contactsRepository,
    limiter: guestRateLimiter,
    resolveClientIp: async () => clientIpFromHeaders(await headers()),
    // The unsubscribe secret already keys one-click, mail-borne capabilities; the
    // cancel token is the same shape, so it shares the secret and its rotation.
    secret: unsubscribeEnv().unsubscribeTokenSecret,
    appUrl,
    async sendConfirmation(confirmation) {
      const rendered = await renderEmail({
        template: "event_guest_confirmation",
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
        idempotencyKey: `guest-rsvp:${confirmation.slug}:${confirmation.to}`,
      });
    },
  });
  return service.submit(formData);
}
