import "server-only";

import {MAX_TICKET_SEATS, TICKET_SESSION_MIN_MS} from "@/config/tickets";
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
  | "EVENT_NOT_FOUND" | "EVENT_NOT_TICKETED" | "EVENT_CLOSED" | "SOLD_OUT" | "INVALID_SEATS" | "UNAVAILABLE";

export type TicketCheckoutResult =
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "error"; code: TicketCheckoutErrorCode}>;

export type TicketCheckoutDependencies = Readonly<{
  orders: EventOrdersRepository;
  stripe: Pick<StripeBillingAdapter, "createEventTicketSession">;
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
    const code: TicketCheckoutErrorCode = created.reason === "SOLD_OUT"
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
  // A reused key returns the session it already minted; minting a second one
  // would charge the buyer twice for one form.
  if (created.order.stripeCheckoutUrl) {
    return {status: "redirect", url: created.order.stripeCheckoutUrl};
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
      // Stripe demands at least 30 minutes after session CREATION, and this
      // clock read is taken after the order write, so a bare `TICKET_HOLD_MS`
      // is a rejection. The margin is Stripe's lower bound plus slack; the
      // database hold stays `TICKET_HOLD_MS`.
      expiresAt: new Date(dependencies.now().getTime() + TICKET_SESSION_MIN_MS),
    });
    await dependencies.orders.attachSession(created.order.id, session.id, session.url);
    return {status: "redirect", url: session.url};
  } catch {
    // The order stays pending and expires; the buyer is never charged.
    return {status: "error", code: "UNAVAILABLE"};
  }
}
