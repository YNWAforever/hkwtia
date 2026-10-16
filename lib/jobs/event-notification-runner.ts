import "server-only";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {appEnv, emailEnv} from "@/lib/config/env";
import {eventNotificationsRepository, type CancellationNoticeClaim} from "@/lib/db/repos/event-notifications";
import {renderEmail, type RenderEmailInput, type RenderedEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport, DeliveryFailure, type EmailSendInput, type EmailTransport} from "@/lib/email/transport";
import {localizedPath} from "@/lib/urls";

const SEND_TIMEOUT_MS = 6_000;
const CLAIM_LIMIT = 10;
const EXPAND_LIMIT = 100;

type Outbox = typeof eventNotificationsRepository;
export type EventNotificationDependencies = Readonly<{
  outbox: Pick<Outbox, "expandPending" | "claimDue" | "knownBlock" | "eventSummary" | "freezePayload" | "settle">;
  transport: EmailTransport;
  renderEmail: (input: RenderEmailInput) => Promise<RenderedEmail>;
  emailFrom: string;
  appUrl: string;
}>;

export function eventCancellationNoticesEnabled(value: string | undefined = process.env.EVENT_CANCELLATION_NOTICES_ENABLED): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("INVALID_EVENT_CANCELLATION_NOTICES_FLAG");
}

export function productionEventNotificationDependencies(): EventNotificationDependencies {
  const email = emailEnv();
  return {
    outbox: eventNotificationsRepository,
    transport: createConfiguredEmailTransport(email),
    renderEmail,
    emailFrom: email.emailFrom,
    appUrl: appEnv().appUrl,
  };
}

async function payloadFor(claim: CancellationNoticeClaim, dependencies: EventNotificationDependencies): Promise<EmailSendInput | null> {
  const event = await dependencies.outbox.eventSummary(automationCronActor(), claim.eventId);
  if (!event) return null;
  const title = claim.recipientLocale === "zh-HK" && event.titleZh ? event.titleZh : event.titleEn;
  const rendered = await dependencies.renderEmail({
    template: "event_rsvp_cancelled", locale: claim.recipientLocale,
    recipientName: claim.recipientName, classification: "transactional",
    variables: {eventTitle: title, ctaUrl: dependencies.appUrl + localizedPath(claim.recipientLocale, `/events/${event.slug}`)},
  });
  return {
    to: claim.recipientEmail, from: dependencies.emailFrom,
    subject: rendered.subject, html: rendered.html, text: rendered.text,
    headers: rendered.headers, idempotencyKey: claim.idempotencyKey,
  };
}

async function sendWithDeadline(transport: EmailTransport, payload: EmailSendInput) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transport.send(payload),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DeliveryFailure("retryable_network")), SEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Provider acceptance is recorded as accepted, never as delivered without a receipt. */
export async function runEventCancellationNotifications(now: Date, dependencies: EventNotificationDependencies): Promise<Readonly<{expanded: number; accepted: number; blocked: number; failed: number; retrying: number; uncertain: number}>> {
  const actor = automationCronActor();
  const expanded = await dependencies.outbox.expandPending(actor, now, EXPAND_LIMIT);
  const claims = await dependencies.outbox.claimDue(actor, now, CLAIM_LIMIT);
  const counts = {expanded: expanded.queued + expanded.blocked, accepted: 0, blocked: expanded.blocked, failed: 0, retrying: 0, uncertain: 0};
  for (const claim of claims) {
    let block: string | null;
    let payload: EmailSendInput | null = claim.payload;
    try {
      block = await dependencies.outbox.knownBlock(actor, claim);
      if (!block && !payload) {
        payload = await payloadFor(claim, dependencies);
        if (payload && !await dependencies.outbox.freezePayload(actor, claim, payload, now)) continue;
      }
    } catch {
      // No provider call has started. A failed DB/eligibility/render read is safe
      // to retry; it is not an unknown provider acceptance.
      await dependencies.outbox.settle(actor, claim, "queued", now, "pre_send_failure");
      counts.retrying += 1;
      continue;
    }
    if (block || !payload) {
      await dependencies.outbox.settle(actor, claim, "blocked", now, block ?? "event_unavailable");
      counts.blocked += 1;
      continue;
    }
    let providerId: string;
    try {
      const result = await sendWithDeadline(dependencies.transport, payload);
      providerId = result.providerId;
    } catch (error) {
      const code = error instanceof DeliveryFailure ? error.code : "provider_unclassified_failure";
      const status = code === "provider_client_error" ? "failed"
        : code === "provider_unclassified_failure" ? "uncertain" : "queued";
      await dependencies.outbox.settle(actor, claim, status, now, code);
      if (status === "failed") counts.failed += 1;
      else if (status === "uncertain") counts.uncertain += 1;
      else counts.retrying += 1;
      continue;
    }
    // A provider response is known at this point. If persistence fails, surface
    // the job failure; the leased row retries with the same frozen key.
    await dependencies.outbox.settle(actor, claim, "accepted", now, providerId);
    counts.accepted += 1;
  }
  return counts;
}
