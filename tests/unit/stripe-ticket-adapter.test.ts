import {describe, expect, it, vi} from "vitest";

import {createStripeBillingAdapter} from "@/lib/billing/stripe";
import {createTicketCheckout, type TicketCheckoutDependencies} from "@/lib/tickets/checkout-core";

function client() {
  const create = vi.fn(async (_params: unknown, _options?: unknown) => ({id: "cs_test_1", url: "https://checkout.stripe.test/1"}));
  const retrieve = vi.fn(async (_id: string) => ({payment_intent: "pi_1"} as {payment_intent: string | {id: string} | null}));
  const refund = vi.fn(async () => ({status: "succeeded"}));
  const listSessions = vi.fn(async () => ({data: [] as Array<{id: string; client_reference_id: string; payment_intent: string; metadata: {kind: string; orderId: string}}>, has_more: false}));
  const listRefunds = vi.fn(async () => ({data: [{id: "re_1", status: "succeeded", currency: "hkd", amount: 50_000}], has_more: false}));
  const retrieveIntent = vi.fn(async () => ({
    id: "pi_1", status: "succeeded", currency: "hkd", amount_received: 50_000,
    latest_charge: {id: "ch_1", currency: "hkd", amount_captured: 50_000, amount_refunded: 50_000},
  }));
  return {
    create, retrieve, refund, retrieveIntent, listRefunds, listSessions,
    value: {
      checkout: {sessions: {create, retrieve, list: listSessions}},
      subscriptions: {retrieve: vi.fn()},
      billingPortal: {sessions: {create: vi.fn()}},
      invoices: {list: vi.fn()},
      refunds: {create: refund, list: listRefunds},
      paymentIntents: {retrieve: retrieveIntent},
    } as never,
  };
}

describe("event ticket checkout session", () => {
  it("is a payment-mode session for the event's price, in HKD cents", async () => {
    const {create, value} = client();
    await createStripeBillingAdapter(value).createEventTicketSession({
      eventTitle: "Edge AI workshop", unitAmountHkdCents: 25_000, seats: 2, orderId: "order-1",
      successUrl: "https://w.test/s", cancelUrl: "https://w.test/c", idempotencyKey: "idem-1",
      expiresAt: new Date("2026-09-14T10:00:00Z"),
    });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.mode).toBe("payment");
    expect(params.client_reference_id).toBe("order-1");
    expect(params.metadata).toEqual({kind: "event_ticket", orderId: "order-1"});
    expect(params.expires_at).toBe(Math.floor(Date.parse("2026-09-14T10:00:00Z") / 1000));
    expect(params.line_items).toEqual([{
      price_data: {currency: "hkd", unit_amount: 25_000, product_data: {name: "Edge AI workshop"}},
      quantity: 2,
    }]);
    expect((create.mock.calls[0]![1] as {idempotencyKey: string}).idempotencyKey).toBe("idem-1");
  });

  it("refunds the payment intent behind a session with a stable idempotency key", async () => {
    const {refund, value} = client();
    await createStripeBillingAdapter(value).refundPaymentIntent("pi_1", "ticket-refund:order-1", {orderId: "order-1"});
    expect(refund).toHaveBeenCalledWith({payment_intent: "pi_1", metadata: {eventOrderId: "order-1"}}, {idempotencyKey: "ticket-refund:order-1"});
  });

  it("does not report an accepted but pending provider refund as complete", async () => {
    const {refund, value} = client();
    refund.mockResolvedValue({status: "pending"});
    await expect(createStripeBillingAdapter(value).refundPaymentIntent("pi_1", "ticket-refund:order-1", {requireSucceeded: true}))
      .rejects.toMatchObject({code: "STRIPE_REFUND_PENDING", message: "STRIPE_REFUND_NOT_SUCCEEDED"});
    await expect(createStripeBillingAdapter(value).refundPaymentIntent("pi_1", "ticket-refund:order-1"))
      .resolves.toBeUndefined();
  });
});

describe("finding an older refund without metadata", () => {
  it("returns no ticket order for an unrelated Checkout payment", async () => {
    const {listSessions, value} = client();
    listSessions.mockResolvedValue({data: [{id: "cs_member", client_reference_id: "member-1",
      payment_intent: "pi_1", metadata: {kind: "membership", orderId: "member-1"}}], has_more: false});
    await expect(createStripeBillingAdapter(value).ticketOrderIdForPaymentIntent("pi_1")).resolves.toBeNull();
  });

  it("returns only the order correlated to the exact payment intent and Checkout reference", async () => {
    const {listSessions, value} = client();
    const orderId = "33333333-3333-4333-8333-333333333333";
    listSessions.mockResolvedValue({data: [{id: "cs_ticket", client_reference_id: orderId,
      payment_intent: "pi_1", metadata: {kind: "event_ticket", orderId}}], has_more: false});
    await expect(createStripeBillingAdapter(value).ticketOrderIdForPaymentIntent("pi_1")).resolves.toBe(orderId);
    expect(listSessions).toHaveBeenCalledWith({payment_intent: "pi_1", limit: 2});
  });
});
describe("reconciling a provider refund after a lost database commit", () => {
  it("accepts only a fully refunded charge for the exact HKD order amount", async () => {
    const {retrieveIntent, listRefunds, value} = client();
    await expect(createStripeBillingAdapter(value).fullyRefundedPaymentIntent("pi_1", 50_000)).resolves.toBe(true);
    expect(retrieveIntent).toHaveBeenCalledWith("pi_1", {expand: ["latest_charge"]});
    expect(listRefunds).toHaveBeenCalledWith({payment_intent: "pi_1", limit: 100});

    listRefunds.mockResolvedValue({data: [{id: "re_1", status: "pending", currency: "hkd", amount: 50_000}], has_more: false});
    await expect(createStripeBillingAdapter(value).fullyRefundedPaymentIntent("pi_1", 50_000)).resolves.toBe(false);
    listRefunds.mockResolvedValue({data: [
      {id: "re_failed", status: "failed", currency: "hkd", amount: 50_000},
      {id: "re_succeeded", status: "succeeded", currency: "hkd", amount: 50_000},
    ], has_more: false});
    await expect(createStripeBillingAdapter(value).fullyRefundedPaymentIntent("pi_1", 50_000)).resolves.toBe(true);

    retrieveIntent.mockResolvedValue({
      id: "pi_1", status: "succeeded", currency: "hkd", amount_received: 50_000,
      latest_charge: {id: "ch_1", currency: "hkd", amount_captured: 50_000, amount_refunded: 25_000},
    });
    await expect(createStripeBillingAdapter(value).fullyRefundedPaymentIntent("pi_1", 50_000)).resolves.toBe(false);
    await expect(createStripeBillingAdapter(value).fullyRefundedPaymentIntent("pi_1", 25_000)).rejects.toThrow("STRIPE_REFUND_AMOUNT_MISMATCH");
  });
});

describe("reading the payment intent behind a settled session", () => {
  it("returns the intent id when Stripe hands back a bare string", async () => {
    const {retrieve, value} = client();
    retrieve.mockResolvedValue({payment_intent: "pi_1"});

    await expect(createStripeBillingAdapter(value).paymentIntentForSession("cs_test_1")).resolves.toBe("pi_1");
    expect(retrieve).toHaveBeenCalledWith("cs_test_1");
  });

  it("returns the intent's id when Stripe expands it to an object", async () => {
    const {retrieve, value} = client();
    retrieve.mockResolvedValue({payment_intent: {id: "pi_expanded"}});

    await expect(createStripeBillingAdapter(value).paymentIntentForSession("cs_test_1")).resolves.toBe("pi_expanded");
  });

  it("returns null when the session has no payment intent", async () => {
    const {retrieve, value} = client();
    retrieve.mockResolvedValue({payment_intent: null});

    await expect(createStripeBillingAdapter(value).paymentIntentForSession("cs_test_1")).resolves.toBeNull();
  });
});

/**
 * The defect this suite could not see: every other ticket test buys ONE seat, so
 * the order total and the per-seat unit are the same number and passing the
 * wrong one to Stripe is invisible. Two seats separate them. The core is driven
 * for real over the real adapter and a fake `StripeClient` seam, so what is
 * asserted is the charge Stripe would build (`unit_amount × quantity`), not the
 * argument shape of a fake adapter.
 */
describe("the charge a two-seat order creates", () => {
  it("is the per-seat unit times the seats, never the order total times the seats", async () => {
    const {create, value} = client();
    const order = {
      id: "order-1", eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test",
      buyerLocale: "en" as const, amountHkdCents: 50_000, currency: "hkd", status: "pending" as const,
      stripeCheckoutSessionId: null, stripeCheckoutUrl: null, idempotencyKey: "idem-1",
      expiresAt: new Date("2026-09-14T04:30:00Z"), paidAt: null, refundedAt: null, refundReason: null,
    };
    const orders = {
      createOrder: vi.fn(async (_input: {amountHkdCents: number}) => ({ok: true, reused: false, order})),
      attachSession: vi.fn(async () => undefined),
    };
    const dependencies: TicketCheckoutDependencies = {
      orders: orders as never,
      stripe: createStripeBillingAdapter(value),
      eventForTicket: vi.fn(async () => ({
        id: "ev-1", slug: "edge-ai", titleEn: "Edge AI", titleZh: "邊緣 AI", startsAt: new Date("2026-10-01T10:00:00Z"),
        published: true, registrationMode: "ticketed", ticketPriceHkdCents: 25_000,
      })),
      appUrl: "https://w.test",
      now: () => new Date("2026-09-14T04:00:00Z"),
    };

    await createTicketCheckout({
      eventId: "ev-1",
      buyer: {profileId: null, name: "Ada", email: "ada@example.test"},
      seats: [{name: "Ada", email: "ada@example.test"}, {name: "Grace", email: "grace@example.test"}],
      idempotencyKey: "idem-1",
      locale: "en",
    }, dependencies);

    const params = create.mock.calls[0]![0] as {line_items: Array<{price_data: {unit_amount: number}; quantity: number}>};
    const line = params.line_items[0]!;
    expect(line.quantity).toBe(2);
    expect(line.price_data.unit_amount * line.quantity).toBe(order.amountHkdCents);
    expect(orders.createOrder.mock.calls[0]![0]).toMatchObject({amountHkdCents: 50_000});
  });
});
