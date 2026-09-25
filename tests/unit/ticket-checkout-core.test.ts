import {describe, expect, it, vi} from "vitest";

import {createTicketCheckout, type TicketCheckoutDependencies} from "@/lib/tickets/checkout-core";

const now = new Date("2026-09-14T04:00:00Z");
const seats = [{name: "Ada", email: "ada@example.test"}];

const pendingOrder = {
  id: "order-1", eventId: "ev-1", amountHkdCents: 25_000, status: "pending" as const,
  stripeCheckoutSessionId: null, stripeCheckoutUrl: null, buyerProfileId: null,
  buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en" as const,
  currency: "hkd", idempotencyKey: "idem-1", expiresAt: now, paidAt: null,
  refundedAt: null, refundReason: null,
};

function dependencies(overrides: Partial<TicketCheckoutDependencies> = {}): TicketCheckoutDependencies {
  return {
    now: () => now,
    appUrl: "https://w.test",
    orders: {
      createOrder: vi.fn(async () => ({ok: true, reused: false, order: pendingOrder})),
      attachSession: vi.fn(async () => undefined),
    } as never,
    stripe: {createEventTicketSession: vi.fn(async () => ({id: "cs_1", url: "https://checkout.stripe.test/1"}))} as never,
    eventForTicket: vi.fn(async () => ({id: "ev-1", slug: "edge-ai", titleEn: "Edge AI", titleZh: "邊緣 AI", startsAt: new Date("2026-10-01T10:00:00Z"), published: true, registrationMode: "ticketed", ticketPriceHkdCents: 25_000})),
    ...overrides,
  };
}

describe("createTicketCheckout", () => {
  it("computes the amount from the event price and redirects to Stripe", async () => {
    const deps = dependencies();
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "redirect", url: "https://checkout.stripe.test/1"});
    expect((deps.orders.createOrder as unknown as {mock: {calls: unknown[][]}}).mock.calls[0]![0]).toMatchObject({amountHkdCents: 25_000});
    expect(deps.stripe.createEventTicketSession).toHaveBeenCalledWith(expect.objectContaining({unitAmountHkdCents: 25_000, seats: 1, orderId: "order-1"}));
  });

  it.each([
    ["a non-ticketed event", {registrationMode: "rsvp"}, "EVENT_NOT_TICKETED"],
    ["an event with no price", {ticketPriceHkdCents: null}, "EVENT_NOT_TICKETED"],
    ["an unpublished event", {published: false}, "EVENT_CLOSED"],
    ["a started event", {startsAt: new Date("2026-09-01T00:00:00Z")}, "EVENT_CLOSED"],
  ])("refuses %s", async (_case, overrides, code) => {
    const deps = dependencies({eventForTicket: vi.fn(async () => ({id: "ev-1", slug: "s", titleEn: "t", titleZh: "t", startsAt: new Date("2026-10-01T10:00:00Z"), published: true, registrationMode: "ticketed", ticketPriceHkdCents: 25_000, ...overrides}))});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "error", code});
  });

  it.each([
    ["a sold-out order", "SOLD_OUT", "SOLD_OUT"],
    ["an amount that does not derive from the price", "AMOUNT_MISMATCH", "UNAVAILABLE"],
    ["a reused key with changed purchase details", "ATTEMPT_CHANGED", "RETRY_CHANGED"],
    ["an event deleted between the read and the order", "EVENT_NOT_FOUND", "EVENT_NOT_FOUND"],
  ] as const)("maps %s to an error", async (_case, reason, code) => {
    const deps = dependencies({orders: {createOrder: vi.fn(async () => ({ok: false, reason}))} as never});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "error", code});
  });

  it("returns an unavailable error when the event is not found", async () => {
    const deps = dependencies({eventForTicket: vi.fn(async () => null)});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "error", code: "EVENT_NOT_FOUND"});
  });

  it("refuses more seats than the policy cap", async () => {
    const many = Array.from({length: 11}, (_, index) => ({name: `A${index}`, email: `a${index}@example.test`}));
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats: many, idempotencyKey: "idem-1", locale: "en"}, dependencies()))
      .resolves.toEqual({status: "error", code: "INVALID_SEATS"});
  });

  it("returns the stored url for a reused order without minting a second session", async () => {
    const deps = dependencies({orders: {createOrder: vi.fn(async () => ({ok: true, reused: true, order: {...pendingOrder, stripeCheckoutSessionId: "cs_existing", stripeCheckoutUrl: "https://checkout.stripe.test/existing"}}))} as never});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "redirect", url: "https://checkout.stripe.test/existing"});
    expect(deps.stripe.createEventTicketSession).not.toHaveBeenCalled();
  });

  it("sends the event's Chinese title and localized return urls for a zh-HK buyer", async () => {
    const deps = dependencies();
    await createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "陳", email: "chan@example.test"}, seats, idempotencyKey: "idem-1", locale: "zh-HK"}, deps);
    expect(deps.stripe.createEventTicketSession).toHaveBeenCalledWith(expect.objectContaining({
      eventTitle: "邊緣 AI",
      successUrl: "https://w.test/zh/events/edge-ai?ticket=received",
      cancelUrl: "https://w.test/zh/events/edge-ai?ticket=cancelled",
    }));
  });

  it("refuses an app url that carries userinfo", async () => {
    const deps = dependencies({appUrl: "https://wtia.org.hk@evil.example"});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .rejects.toThrow("INVALID_APP_URL");
    // The write-then-throw defect: a bad APP_URL must be rejected before the
    // pending order exists, or it strands seats for the whole hold window and
    // still errors.
    expect(deps.orders.createOrder).not.toHaveBeenCalled();
  });

  // Stripe requires `expires_at` to be at least 30 minutes after the session is
  // CREATED. The hold is computed before the order write and the network call,
  // so the reading taken at the call is the one the margin must clear.
  it("expires the Stripe session at least 30 minutes after the reading taken at the call", async () => {
    const orderTime = new Date("2026-09-14T04:00:00Z");
    const callTime = new Date(orderTime.getTime() + 60_000);
    const readings = [orderTime, callTime];
    let index = 0;
    const deps = dependencies({
      now: () => readings[Math.min(index++, readings.length - 1)]!,
      orders: {
        createOrder: vi.fn(async () => ({ok: true, reused: false, order: {...pendingOrder, expiresAt: new Date(orderTime.getTime() + 1_800_000)}})),
        attachSession: vi.fn(async () => undefined),
      } as never,
    });

    await createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps);

    const adapter = deps.stripe.createEventTicketSession as unknown as {mock: {calls: Array<[{expiresAt: Date}]>}};
    const expiresAt = adapter.mock.calls[0]![0].expiresAt;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(callTime.getTime() + 1_800_000);
  });
});
