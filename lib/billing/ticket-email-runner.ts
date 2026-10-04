import "server-only";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {appEnv, emailEnv, ticketPassEnv} from "@/lib/config/env";
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import type {OrderRecord, EventOrdersRepository} from "@/lib/db/repos/event-orders";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {ticketEmailOutboxRepository, type TicketEmailClaim} from "@/lib/db/repos/ticket-email-outbox";
import type {TicketEmailPayload} from "@/lib/db/server-schema";
import type {EmailVariables} from "@/lib/email/catalog";
import {renderEmail, type RenderEmailInput, type RenderedEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport, DeliveryFailure, type EmailTransport} from "@/lib/email/transport";
import {signPassToken} from "@/lib/tickets/pass-token";
import {localizedPath} from "@/lib/urls";

type Outbox = typeof ticketEmailOutboxRepository;
export type TicketEmailMetric =
  | Readonly<{kind: "provider_send"; outcome: "accepted" | "refused" | "uncertain"; durationMs: number}>
  | Readonly<{kind: "queue_health"; claimed: number; backlog: number; oldestPendingAgeSeconds: number | null}>
  | Readonly<{kind: "queue_health_unavailable"}>;
export type TicketEmailRunnerDependencies = Readonly<{
  outbox: Pick<Outbox, "claimDue" | "claimForOrder" | "freezePayload" | "markSent"
    | "markRetryable" | "markBlocked" | "markSuppressed"> & Partial<Pick<Outbox, "queueHealth">>;
  orders: Pick<EventOrdersRepository, "orderById" | "eventSummary" | "orderSeats"
    | "seatsOfOrder" | "seatForPass" | "resendEligible" | "reconcileRefundedOrder">;
  renderEmail: (input: RenderEmailInput) => Promise<RenderedEmail>;
  transport: EmailTransport;
  refundVerified: (order: OrderRecord) => Promise<boolean>;
  emailFrom: string;
  appUrl: string;
  passSecret: string;
  recordMetric?: (metric: TicketEmailMetric) => void;
}>;

const SEND_TIMEOUT_MS = 6_000;
const BATCH_LIMIT = 3;

function formatHkd(cents: number, locale: "en" | "zh-HK"): string {
  return new Intl.NumberFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatEventDate(date: Date, locale: "en" | "zh-HK"): string {
  return new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {
    dateStyle: "long", timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function admissible(kind: TicketEmailClaim["kind"], status: OrderRecord["status"]): boolean {
  if (kind === "confirmation" || kind === "pass") return status === "paid";
  if (kind === "refund") return status === "refunded" || status === "refund_pending";
  return status === "paid" || status === "refund_failed";
}

async function payloadFor(
  claim: TicketEmailClaim, order: OrderRecord, dependencies: TicketEmailRunnerDependencies,
): Promise<TicketEmailPayload> {
  const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
  const eventTitle = event?.title ?? "";
  const eventDate = event ? formatEventDate(event.startsAt, order.buyerLocale) : "";
  const eventUrl = event
    ? dependencies.appUrl + localizedPath(order.buyerLocale, "/events/" + event.slug)
    : dependencies.appUrl;

  let to = order.buyerEmail;
  let recipientName = order.buyerName;
  let variables: EmailVariables;
  let template: RenderEmailInput["template"];
  if (claim.kind === "confirmation") {
    template = "event_ticket_confirmation";
    variables = {
      eventTitle, eventDate,
      seatCount: String(await dependencies.orders.seatsOfOrder(order.id)),
      attendees: (await dependencies.orders.orderSeats(order.id)).map((seat) => seat.attendeeName).join(", "),
      amount: formatHkd(order.amountHkdCents, order.buyerLocale),
      orderId: order.id, ctaUrl: eventUrl,
      refundPolicyUrl: dependencies.appUrl + localizedPath(order.buyerLocale, "/refund-policy"),
    };
  } else if (claim.kind === "pass") {
    if (!claim.seatId) throw new Error("TICKET_SEAT_CONTEXT_MISSING");
    const seat = await dependencies.orders.seatForPass(claim.seatId);
    if (!seat || seat.order.id !== claim.orderId || seat.eventId !== order.eventId) {
      throw new Error("TICKET_SEAT_CONTEXT_MISSING");
    }
    template = "event_ticket_pass";
    to = seat.attendeeEmail;
    recipientName = seat.attendeeName;
    variables = {
      eventTitle, attendeeName: seat.attendeeName, eventDate, venue: event?.venue ?? "",
      ctaUrl: dependencies.appUrl + localizedPath(order.buyerLocale,
        "/pass/" + signPassToken({seatId: seat.seatId, eventId: seat.eventId}, dependencies.passSecret)),
    };
  } else {
    template = claim.kind === "refund" ? "event_ticket_refunded" : "event_ticket_refund_failed";
    variables = {
      eventTitle, amount: formatHkd(order.amountHkdCents, order.buyerLocale),
      orderId: order.id,
      ctaUrl: claim.kind === "refund_failed"
        ? dependencies.appUrl + localizedPath(order.buyerLocale, "/contact")
        : eventUrl,
    };
  }
  const rendered = await dependencies.renderEmail({
    template, locale: order.buyerLocale, recipientName,
    classification: "transactional", variables,
  });
  return {
    to, from: dependencies.emailFrom, subject: rendered.subject,
    html: rendered.html, text: rendered.text, headers: rendered.headers,
    idempotencyKey: claim.eventKey,
  };
}

// The installed Resend SDK has no abort signal for emails.send. A timeout
// bounds the job, but the provider may still accept the request. The frozen
// request and key are reused, and the outbox stops before its 24-hour window.
async function sendWithDeadline(transport: EmailTransport, payload: TicketEmailPayload) {
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

function emitMetric(dependencies: TicketEmailRunnerDependencies, metric: TicketEmailMetric): void {
  try { dependencies.recordMetric?.(metric); }
  catch { /* Telemetry cannot change a provider send or settlement outcome. */ }
}

async function processClaims(
  claims: readonly TicketEmailClaim[], dependencies: TicketEmailRunnerDependencies, now: Date,
): Promise<void> {
  for (const claim of claims) {
    let order: OrderRecord | null;
    try {
      order = await dependencies.orders.orderById(claim.orderId);
    } catch {
      await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "order_read_failed");
      continue;
    }
    if (!order) {
      await dependencies.outbox.markBlocked(claim.id, claim.attemptCount, now, "order_missing");
      continue;
    }
    if (!admissible(claim.kind, order.status)) {
      await dependencies.outbox.markSuppressed(claim.id, claim.attemptCount, now);
      continue;
    }

    if (claim.kind === "pass" && claim.eventKey.startsWith("ticket-resend:")) {
      if (process.env.TICKET_RESEND_BATCH_ENABLED !== "true") {
        await dependencies.outbox.markSuppressed(claim.id, claim.attemptCount, now);
        continue;
      }
      if (!claim.seatId) {
        await dependencies.outbox.markBlocked(claim.id, claim.attemptCount, now, "seat_missing");
        continue;
      }
      let valid: boolean;
      try {valid = await dependencies.orders.resendEligible(claim.seatId, now);}
      catch {
        await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "resend_eligibility_read_failed");
        continue;
      }
      if (!valid) {
        await dependencies.outbox.markSuppressed(claim.id, claim.attemptCount, now);
        continue;
      }
    }

    if (claim.kind === "refund") {
      let verified: boolean;
      try {
        verified = await dependencies.refundVerified(order);
      } catch {
        await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "refund_verify_failed");
        continue;
      }
      if (!verified) {
        await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "refund_pending");
        continue;
      }
      if (order.status === "refund_pending") {
        try {
          await dependencies.orders.reconcileRefundedOrder(order.id, {
            refundedAt: now, expectedAmountHkdCents: order.amountHkdCents,
            actorUserId: null, actorType: "system", refundReason: order.refundReason ?? "cancelled",
            reason: "provider_reconciled", note: null, stripeEventId: null,
          });
          const current = await dependencies.orders.orderById(order.id);
          if (!current || current.status !== "refunded") throw new Error("REFUND_SETTLEMENT_NOT_VERIFIED");
          order = current;
        } catch {
          await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "refund_commit_failed");
          continue;
        }
      }
    }

    let payload = claim.payload;
    if (!payload) {
      try {
        payload = await payloadFor(claim, order, dependencies);
      } catch (error) {
        const missingSeat = error instanceof Error && error.message === "TICKET_SEAT_CONTEXT_MISSING";
        if (missingSeat) {
          await dependencies.outbox.markBlocked(claim.id, claim.attemptCount, now, "seat_missing");
        } else {
          await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "render_failed");
        }
        continue;
      }
      if (!await dependencies.outbox.freezePayload(claim.id, claim.attemptCount, payload, now)) continue;
    }

    // Rendering/freezing may overlap a refund or revocation. Check the current
    // paid-order authority again immediately before invoking the provider.
    let currentOrder: OrderRecord | null;
    try {currentOrder = await dependencies.orders.orderById(claim.orderId);}
    catch {
      await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "order_read_failed");
      continue;
    }
    if (!currentOrder || !admissible(claim.kind, currentOrder.status)) {
      await dependencies.outbox.markSuppressed(claim.id, claim.attemptCount, now);
      continue;
    }
    if (claim.kind === "pass" && claim.eventKey.startsWith("ticket-resend:")) {
      let valid: boolean;
      try {valid = process.env.TICKET_RESEND_BATCH_ENABLED === "true" && claim.seatId !== null
        && await dependencies.orders.resendEligible(claim.seatId, now);}
      catch {
        await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now, "resend_eligibility_read_failed");
        continue;
      }
      if (!valid) {await dependencies.outbox.markSuppressed(claim.id, claim.attemptCount, now); continue;}
    }

    const startedAt = performance.now();
    let providerAccepted = false;
    let providerDurationMs = 0;
    try {
      const result = await sendWithDeadline(dependencies.transport, payload);
      providerAccepted = true;
      providerDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (!await dependencies.outbox.markSent(claim.id, claim.attemptCount, result.providerId)) {
        throw new Error("TICKET_EMAIL_SETTLEMENT_LOST");
      }
      emitMetric(dependencies, {
        kind: "provider_send", outcome: "accepted",
        durationMs: providerDurationMs,
      });
    } catch (error) {
      if (!providerAccepted) providerDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
      emitMetric(dependencies, {
        kind: "provider_send",
        outcome: providerAccepted ? "uncertain"
          : error instanceof DeliveryFailure && error.code === "provider_client_error" ? "refused" : "uncertain",
        durationMs: providerDurationMs,
      });
      if (error instanceof DeliveryFailure && error.code === "provider_client_error") {
        await dependencies.outbox.markBlocked(claim.id, claim.attemptCount, now, error.code);
      } else {
        await dependencies.outbox.markRetryable(claim.id, claim.attemptCount, now,
          error instanceof DeliveryFailure ? error.code : "delivery_unknown");
      }
    }
  }
}

export async function deliverTicketEmailsForOrder(
  orderId: string, dependencies: TicketEmailRunnerDependencies, now = new Date(),
): Promise<void> {
  const claims = await dependencies.outbox.claimForOrder(orderId, now, BATCH_LIMIT);
  await processClaims(claims, dependencies, now);
}

export async function drainTicketEmailOutbox(
  now: Date, dependencies: TicketEmailRunnerDependencies,
): Promise<void> {
  const actor = automationCronActor();
  const claims = await dependencies.outbox.claimDue(actor, now, BATCH_LIMIT);
  await processClaims(claims, dependencies, now);
  if (dependencies.outbox.queueHealth && dependencies.recordMetric) {
    try {
      const health = await dependencies.outbox.queueHealth(actor, new Date());
      emitMetric(dependencies, {kind: "queue_health", claimed: claims.length, ...health});
    } catch {
      emitMetric(dependencies, {kind: "queue_health_unavailable"});
    }
  }
}

export function productionTicketEmailDependencies(): TicketEmailRunnerDependencies {
  const environment = emailEnv();
  return {
    outbox: ticketEmailOutboxRepository, orders: eventOrdersRepository, renderEmail,
    transport: createConfiguredEmailTransport(environment), emailFrom: environment.emailFrom,
    appUrl: appEnv().appUrl, passSecret: ticketPassEnv().ticketPassTokenSecret,
    recordMetric: (metric) => console.info(JSON.stringify({event: "ticket_email_metric", ...metric})),
    refundVerified: async (order) => {
      if (!order.stripeCheckoutSessionId) return false;
      const stripe = stripeBillingAdapter();
      const paymentIntentId = await stripe.paymentIntentForSession(order.stripeCheckoutSessionId);
      return paymentIntentId !== null
        && stripe.fullyRefundedPaymentIntent(paymentIntentId, order.amountHkdCents);
    },
  };
}
