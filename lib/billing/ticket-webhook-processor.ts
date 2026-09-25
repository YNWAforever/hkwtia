import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import type {EventOrdersRepository, OrderRecord} from "@/lib/db/repos/event-orders";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {appEnv, emailEnv, ticketPassEnv} from "@/lib/config/env";
import {renderEmail} from "@/lib/email/render";
import type {EmailVariables} from "@/lib/email/catalog";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import type {TicketProcessor, TicketWebhookCommand} from "@/lib/billing/webhook-service";
import {localizedPath} from "@/lib/urls";
import {signPassToken} from "@/lib/tickets/pass-token";

type TicketEmailDependencies = Readonly<{
  renderEmail: typeof renderEmail;
  transport: ReturnType<typeof createConfiguredEmailTransport>;
  emailFrom: string;
}>;

export type TicketProcessorDependencies = Readonly<{
  orders: Pick<EventOrdersRepository, "settlePaid" | "expireBySession" | "eventSummary" | "seatsOfOrder" | "orderSeats" | "seatForPass">;
  /** The deterministic key makes a retried refund safe to re-issue. */
  refundPaymentIntent: (paymentIntentId: string, idempotencyKey: string, orderId: string) => Promise<void>;
  email: TicketEmailDependencies;
  /** For the receipt's "view the event" link, built from the order's own locale. */
  appUrl: string;
  /** Signs each attendee's pass URL; the pass page verifies with the same key. */
  passSecret: string;
  now: () => Date;
  /** Best-effort: a mail failure must not fail the webhook, which Stripe retries. */
  onEmailError?: (error: unknown, context: Readonly<{orderId: string; template: string}>) => void;
}>;

/**
 * Grouped to two decimals in the buyer's locale, because the copy reads
 * `HK${amount}` and a bare `toFixed(2)` renders 100000 as `HK$1000.00`.
 */
function formatHkd(cents: number, locale: "en" | "zh-HK"): string {
  return new Intl.NumberFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatEventDate(value: Date, locale: "en" | "zh-HK"): string {
  return new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(value);
}

type EventSummary = Readonly<{title: string; startsAt: Date; slug: string; venue: string | null}>;

type TicketEmailTemplate = "event_ticket_confirmation" | "event_ticket_refunded" | "event_ticket_refund_failed" | "event_ticket_pass";

/**
 * Overrides for the per-attendee pass: the receipt is the buyer's, so its
 * recipient and link come from the order, while each pass goes to one seat with
 * that seat's own link and its own idempotency key.
 */
type TicketEmailOverrides = Readonly<{attendeeName?: string; to?: string; ctaUrl?: string; idempotencyKey?: string}>;

async function sendTicketEmail(
  dependencies: TicketProcessorDependencies,
  template: TicketEmailTemplate,
  order: OrderRecord,
  event: EventSummary | null,
  overrides: TicketEmailOverrides = {},
  options: Readonly<{throwOnError?: boolean}> = {},
): Promise<void> {
  const eventTitle = event?.title ?? "";
  const ctaUrl = overrides.ctaUrl ?? (event
    ? `${dependencies.appUrl}${localizedPath(order.buyerLocale, `/events/${event.slug}`)}`
    : dependencies.appUrl);
  try {
    // Every placeholder the copy uses must be supplied here: the renderer throws
    // `EMAIL_VARIABLE_MISSING` / `EMAIL_CTA_URL_REQUIRED`, and because the failure
    // is caught below it would otherwise send nothing and look like success.
    const variables: EmailVariables = template === "event_ticket_confirmation"
      ? {
        eventTitle,
        eventDate: event ? formatEventDate(event.startsAt, order.buyerLocale) : "",
        seatCount: String(await dependencies.orders.seatsOfOrder(order.id)),
        attendees: (await dependencies.orders.orderSeats(order.id)).map((seat) => seat.attendeeName).join(", "),
        amount: formatHkd(order.amountHkdCents, order.buyerLocale),
        orderId: order.id,
        ctaUrl,
        refundPolicyUrl: `${dependencies.appUrl}${localizedPath(order.buyerLocale, "/refund-policy")}`,
      }
      : template === "event_ticket_pass"
        ? {
          eventTitle,
          attendeeName: overrides.attendeeName ?? "",
          eventDate: event ? formatEventDate(event.startsAt, order.buyerLocale) : "",
          venue: event?.venue ?? "",
          ctaUrl,
        }
        : {
          eventTitle,
          amount: formatHkd(order.amountHkdCents, order.buyerLocale),
          orderId: order.id,
          ctaUrl,
        };
    const rendered = await dependencies.email.renderEmail({
      template,
      locale: order.buyerLocale,
      recipientName: order.buyerName,
      classification: "transactional",
      variables,
    });
    await dependencies.email.transport.send({
      to: overrides.to ?? order.buyerEmail,
      from: dependencies.email.emailFrom,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      // Keyed on the order and the outcome: a redelivered webhook re-renders the
      // same message and is a no-op at the transport, while a later refund of the
      // same order is a different key and still sends.
      idempotencyKey: overrides.idempotencyKey ?? `${template === "event_ticket_confirmation" ? "ticket-confirmation" : "ticket-refund"}:${order.id}`,
    });
  } catch (error) {
    // The settlement-committed sends (receipt, refund) keep swallowing: the
    // order is already paid and a throw here would 500 a webhook Stripe only
    // redelivers into a `duplicate`. A user-initiated send opts into `throwOnError`
    // so its caller can tell "sent" from "nothing was sent".
    if (options.throwOnError) throw error;
    dependencies.onEmailError?.(error, {orderId: order.id, template});
  }
}

/**
 * What a pass send actually did. The webhook ignores this (a settled order is
 * never failed over mail), but a staff resend must not report a send that never
 * left: `undeliverable` and `not_admissible` both resolve to the failure message.
 */
export type SeatPassOutcome = "sent" | "undeliverable" | "not_admissible";

/**
 * One seat's pass, with the attempt key supplied by the caller: the webhook
 * passes the settlement instant (so a redelivery is a no-op) and the staff
 * resend passes a fresh attempt (so a deliberate resend is never suppressed).
 *
 * The seat id is the only input: the order and the event are resolved here, so
 * a caller cannot pair a seat with the wrong order.
 */
export async function sendSeatPass(
  dependencies: TicketProcessorDependencies,
  input: Readonly<{seatId: string; attemptKey: string}>,
): Promise<SeatPassOutcome> {
  const seat = await dependencies.orders.seatForPass(input.seatId);
  // `seatForPass` returns null for a seat whose order is not `paid`, the same
  // refusal the pass page makes; nothing is sent for a refunded seat.
  if (!seat) return "not_admissible";
  const event = await dependencies.orders.eventSummary(seat.eventId, seat.buyerLocale);
  const passUrl = `${dependencies.appUrl}${localizedPath(seat.buyerLocale, `/pass/${signPassToken({seatId: seat.seatId, eventId: seat.eventId}, dependencies.passSecret)}`)}`;
  try {
    await sendTicketEmail(dependencies, "event_ticket_pass", seat.order, event, {
      attendeeName: seat.attendeeName,
      to: seat.attendeeEmail,
      ctaUrl: passUrl,
      idempotencyKey: `ticket-pass:${seat.seatId}:${input.attemptKey}`,
    }, {throwOnError: true});
    return "sent";
  } catch (error) {
    // Still logged here, once: the webhook's own guard only sees reads that
    // threw before this point, so an email failure must not go unrecorded.
    dependencies.onEmailError?.(error, {orderId: seat.order.id, template: "event_ticket_pass"});
    return "undeliverable";
  }
}

/**
 * The refund email for a refund committed outside the webhook — a staff refund
 * (Phase D-4c). Same template, recipient and deterministic `ticket-refund:<orderId>`
 * key as the webhook's own refund lane, so the two paths cannot send two different
 * messages for one refund, and a re-issue collapses at the transport rather than
 * mailing the buyer twice.
 *
 * Best-effort by design: the refund is already committed, so a mail failure is
 * logged and never thrown past the caller — a failed send must not undo a refund.
 */
export async function sendOrderRefundEmail(
  order: OrderRecord,
  dependencies: TicketProcessorDependencies = ticketProcessorDependencies(),
  idempotencyKey?: string,
): Promise<void> {
  try {
    // `eventSummary` throws *before* `sendTicketEmail`'s own catch, and a refund
    // email with no event is still better than none, so the read is inside this
    // guard rather than left to escape.
    const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
    await sendTicketEmail(dependencies, "event_ticket_refunded", order, event, {idempotencyKey});
  } catch (error) {
    dependencies.onEmailError?.(error, {orderId: order.id, template: "event_ticket_refunded"});
  }
}

/** Notify the buyer after a failed refund attempt, whether or not a success notice preceded it. */
export async function sendOrderRefundFailureEmail(order: OrderRecord, eventId: string, dependencies: TicketProcessorDependencies = ticketProcessorDependencies()): Promise<void> {
  try {
    const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
    await sendTicketEmail(dependencies, "event_ticket_refund_failed", order, event, {
      ctaUrl: `${dependencies.appUrl}${localizedPath(order.buyerLocale, "/contact")}`,
      idempotencyKey: `ticket-refund-failed:${order.id}:${eventId}`,
    });
  } catch (error) {
    dependencies.onEmailError?.(error, {orderId: order.id, template: "event_ticket_refund_failed"});
  }
}

let defaultDependencies: TicketProcessorDependencies | undefined;

/**
 * The production dependency bag, built on first use so no env is read at import.
 *
 * The staff resend (`resendPassAction`) consumes `sendSeatPass` with the same bag
 * the webhook builds, so both paths send the identical email rather than two
 * implementations that drift.
 */
export function ticketProcessorDependencies(): TicketProcessorDependencies {
  defaultDependencies ??= {
    orders: eventOrdersRepository,
    refundPaymentIntent: (paymentIntentId, idempotencyKey, orderId) => stripeBillingAdapter().refundPaymentIntent(paymentIntentId, idempotencyKey, {orderId}),
    email: {renderEmail, transport: createConfiguredEmailTransport(), emailFrom: emailEnv().emailFrom},
    appUrl: appEnv().appUrl,
    passSecret: ticketPassEnv().ticketPassTokenSecret,
    now: () => new Date(),
    onEmailError(error, context) { console.error("ticket email failed", context, error); },
  };
  return defaultDependencies;
}

export function createTicketProcessor(dependencies: TicketProcessorDependencies): TicketProcessor {
  /** One pass per seat. The key carries the settlement instant: identical on a
   *  redelivery (so nothing is re-sent) and different on a deliberate resend. */
  async function sendPassEmails(order: OrderRecord): Promise<void> {
    const seats = await dependencies.orders.orderSeats(order.id);
    const settlement = order.paidAt?.getTime() ?? 0;
    for (const seat of seats) {
      // Per-seat guard: one seat's failed read must not drop the passes for the
      // seats after it. The settlement is already committed, so the loss is
      // recoverable only by Task 7's staff resend.
      try {
        await sendSeatPass(dependencies, {seatId: seat.seatId, attemptKey: String(settlement)});
      } catch (error) {
        dependencies.onEmailError?.(error, {orderId: order.id, template: "event_ticket_pass"});
      }
    }
  }

  return {
    async process(_actor: Actor, command: TicketWebhookCommand): Promise<"processed" | "duplicate"> {
      if (command.eventType === "checkout.session.expired") {
        await dependencies.orders.expireBySession(command.checkoutSessionId);
        return "processed";
      }

      const settlement = await dependencies.orders.settlePaid(command.checkoutSessionId, dependencies.now());
      const order = settlement.order;
      if (!order) return "duplicate";

      if (settlement.status === "oversold" || settlement.status === "refund_due") {
        // `oversold`: the seats were sold between checkout and payment.
        // `refund_due`: the session was paid in the moment our hold lapsed, or a
        // refund we committed but whose provider call failed.
        // Either way the whole charge is returned, never a partial credit.
        // A committed refund-due state with no provider intent is unfinished
        // work. Make Stripe retry instead of permanently acknowledging it.
        if (!command.paymentIntentId) throw new Error("TICKET_PAYMENT_INTENT_MISSING");
        // Re-issuing is safe: the deterministic key makes a redelivery after a
        // failed provider call refund the same payment intent once, not twice.
        await dependencies.refundPaymentIntent(command.paymentIntentId, `ticket-refund:${order.id}`, order.id);
        const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
        await sendTicketEmail(dependencies, "event_ticket_refunded", order, event);
        return "processed";
      }
      if (settlement.status === "paid") {
        // Only a paid settlement admits anyone, so only it earns a pass. An
        // oversold or late-paid order has already taken the refund branch above.
        //
        // Both guards exist because the settlement is already committed. Without
        // them a failed read escapes `process`, the route answers 500, and Stripe
        // redelivers — but the redelivery makes `settlePaid` answer `duplicate`,
        // so the paid branch is skipped before either send runs and the receipt
        // and every pass are lost with no retry. Log the failure and leave the
        // recovery to the staff resend rather than to a Stripe redelivery. The
        // receipt's own guard covers `eventSummary`, which throws *before* the
        // email catch inside `sendTicketEmail` can see it.
        try {
          const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
          await sendTicketEmail(dependencies, "event_ticket_confirmation", order, event);
        } catch (error) {
          dependencies.onEmailError?.(error, {orderId: order.id, template: "event_ticket_confirmation"});
        }
        try {
          await sendPassEmails(order);
        } catch (error) {
          dependencies.onEmailError?.(error, {orderId: order.id, template: "event_ticket_pass"});
        }
      }
      return "processed";
    },
  };
}
