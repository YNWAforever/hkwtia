import "server-only";

import {MAX_TICKET_SEATS, TICKET_HOLD_MS, TICKET_SESSION_MIN_MS} from "@/config/tickets";
import type {AppLocale} from "@/i18n/routing";
import {appEnv} from "@/lib/config/env";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {eventOrdersRepository, ticketEventFor, ticketSeatsSchema, type EventOrdersRepository, type SeatInput, type TicketEvent} from "@/lib/db/repos/event-orders";
import {localizedPath} from "@/lib/urls";

export type {TicketEvent};

export type TicketCheckoutInput = Readonly<{
  eventId: string;
  buyer: Readonly<{profileId: string | null; name: string; email: string}>;
  seats: readonly SeatInput[];
  idempotencyKey: string;
  locale: AppLocale;
}>;

export type TicketCheckoutErrorCode =
  | "EVENT_NOT_FOUND" | "EVENT_NOT_TICKETED" | "EVENT_CLOSED" | "SOLD_OUT" | "INVALID_SEATS" | "UNAVAILABLE" | "RETRY_CHANGED" | "RETRY_EXPIRED" | "ALREADY_COMPLETED";

export type TicketCheckoutResult =
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "error"; code: TicketCheckoutErrorCode}>;

export type TicketCheckoutDependencies = Readonly<{
  orders: EventOrdersRepository;
  stripe: Pick<StripeBillingAdapter, "createEventTicketSession" | "ticketSessionStatus">;
  eventForTicket: (eventId: string) => Promise<TicketEvent | null>;
  appUrl: string;
  now: () => Date;
}>;

function defaultDependencies(): TicketCheckoutDependencies {
  return {
    orders: eventOrdersRepository,
    stripe: stripeBillingAdapter(),
    eventForTicket: ticketEventFor,
    appUrl: appEnv().appUrl,
    now: () => new Date(),
  };
}

function appOrigin(appUrl: string): string {
  try {
    const parsed = new URL(appUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.origin;
  } catch {
    throw new Error("INVALID_APP_URL");
  }
}

/**
 * Buy seats for a ticketed event. The amount is computed here, from the event's
 * own price -- a request never carries a number that becomes money.
 */
export async function createTicketCheckout(
  input: TicketCheckoutInput,
  dependencies: TicketCheckoutDependencies = defaultDependencies(),
): Promise<TicketCheckoutResult> {
  const parsedSeats = ticketSeatsSchema.safeParse(input.seats);
  if (!parsedSeats.success || parsedSeats.data.length > MAX_TICKET_SEATS) {
    return {status: "error", code: "INVALID_SEATS"};
  }

  const event = await dependencies.eventForTicket(input.eventId);
  if (!event) return {status: "error", code: "EVENT_NOT_FOUND"};
  if (event.registrationMode !== "ticketed" || event.ticketPriceHkdCents === null) {
    return {status: "error", code: "EVENT_NOT_TICKETED"};
  }
  const now = dependencies.now();
  if (!event.published || event.startsAt <= now) return {status: "error", code: "EVENT_CLOSED"};

  const amountHkdCents = event.ticketPriceHkdCents * parsedSeats.data.length;
  // Validated BEFORE the order row is written: a bad `APP_URL` must fail with no
  // side effect, not strand a pending order holding the buyer's seats for the
  // whole hold window and then error. Nothing between the row write and the
  // session call reads configuration, so this is the only place that can.
  const origin = appOrigin(dependencies.appUrl);
  const eventPath = localizedPath(input.locale, `/events/${event.slug}`);
  const created = await dependencies.orders.createOrder({
    eventId: event.id,
    buyerProfileId: input.buyer.profileId,
    buyerName: input.buyer.name,
    buyerEmail: input.buyer.email,
    buyerLocale: input.locale,
    idempotencyKey: input.idempotencyKey,
    seats: parsedSeats.data,
    amountHkdCents,
    now,
  });
  if (!created.ok) {
    const code: TicketCheckoutErrorCode = created.reason === "EVENT_CLOSED"
      ? "EVENT_CLOSED"
      : created.reason === "ATTEMPT_CHANGED"
        ? "RETRY_CHANGED"
        : created.reason === "ATTEMPT_EXPIRED"
          ? "RETRY_EXPIRED"
          : created.reason === "ATTEMPT_COMPLETED"
            ? "ALREADY_COMPLETED"
            : created.reason === "SOLD_OUT"
              ? "SOLD_OUT"
              : created.reason === "EVENT_NOT_TICKETED"
                ? "EVENT_NOT_TICKETED"
                // A mismatch means this service computed the amount wrongly; it is our
                // bug, not the buyer's, so it is reported as unavailable.
                : created.reason === "AMOUNT_MISMATCH"
                  ? "UNAVAILABLE"
                  : "EVENT_NOT_FOUND";
    return {status: "error", code};
  }
  // The provider's session can outlive the local seat hold. Keep an open one on
  // its original key; rotate only after Stripe confirms expiry, so one retry
  // cannot create a second payable session in that overlap.
  if (created.order.stripeCheckoutSessionId || created.order.stripeCheckoutUrl) {
    if (!created.order.stripeCheckoutSessionId || !created.order.stripeCheckoutUrl) {
      return {status: "error", code: "UNAVAILABLE"};
    }
    let status: "open" | "complete" | "expired";
    try {
      status = await dependencies.stripe.ticketSessionStatus(created.order.stripeCheckoutSessionId);
    } catch {
      return {status: "error", code: "UNAVAILABLE"};
    }
    if (status === "complete") return {status: "error", code: "ALREADY_COMPLETED"};
    if (status === "expired") {
      try {
        const released = await dependencies.orders.expireBySession(created.order.stripeCheckoutSessionId);
        return {status: "error", code: released ? "RETRY_EXPIRED" : "UNAVAILABLE"};
      } catch {
        return {status: "error", code: "UNAVAILABLE"};
      }
    }
    return {status: "redirect", url: created.order.stripeCheckoutUrl};
  }

  // Stripe compares the full request for a reused idempotency key. Derive the
  // provider expiry from the order's immutable hold instead of a fresh clock read.
  // Stop retries once the fixed expiry approaches Stripe's 30-minute minimum;
  // an unattached session has never supplied a payable URL to this buyer.
  const sessionExpiresAt = new Date(created.order.expiresAt.getTime() + TICKET_SESSION_MIN_MS - TICKET_HOLD_MS);
  if (sessionExpiresAt.getTime() - dependencies.now().getTime() < TICKET_HOLD_MS + 60_000) {
    try {
      const released = await dependencies.orders.expireUnattachedOrder(created.order.id);
      return {status: "error", code: released ? "RETRY_EXPIRED" : "UNAVAILABLE"};
    } catch {
      return {status: "error", code: "UNAVAILABLE"};
    }
  }

  try {
    const session = await dependencies.stripe.createEventTicketSession({
      eventTitle: input.locale === "zh-HK" ? event.titleZh : event.titleEn,
      // The PER-SEAT price: Stripe multiplies it by `seats`. The order's own
      // `amountHkdCents` is the total, and it is what the receipt reports -- so
      // the two are the same number only when one seat is bought.
      unitAmountHkdCents: event.ticketPriceHkdCents,
      seats: parsedSeats.data.length,
      orderId: created.order.id,
      successUrl: `${origin}${eventPath}?ticket=received`,
      cancelUrl: `${origin}${eventPath}?ticket=cancelled`,
      idempotencyKey: created.order.idempotencyKey,
      expiresAt: sessionExpiresAt,
    });
    const attached = await dependencies.orders.attachSession(created.order.id, session.id, session.url);
    if (!attached) return {status: "error", code: "UNAVAILABLE"};
    return {status: "redirect", url: session.url};
  } catch {
    // The order stays pending and expires; the buyer is never charged.
    return {status: "error", code: "UNAVAILABLE"};
  }
}
