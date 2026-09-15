import {describe, expect, it, vi} from "vitest";

import {createStripeBillingAdapter} from "@/lib/billing/stripe";

function client() {
  const create = vi.fn(async (_params: unknown, _options?: unknown) => ({id: "cs_test_1", url: "https://checkout.stripe.test/1"}));
  const refund = vi.fn(async () => ({}));
  return {
    create, refund,
    value: {
      checkout: {sessions: {create}},
      billingPortal: {sessions: {create: vi.fn()}},
      invoices: {list: vi.fn()},
      refunds: {create: refund},
    } as never,
  };
}

describe("event ticket checkout session", () => {
  it("is a payment-mode session for the event's price, in HKD cents", async () => {
    const {create, value} = client();
    await createStripeBillingAdapter(value).createEventTicketSession({
      eventTitle: "Edge AI workshop", amountHkdCents: 25_000, seats: 2, orderId: "order-1",
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
    await createStripeBillingAdapter(value).refundPaymentIntent("pi_1", "ticket-refund:order-1");
    expect(refund).toHaveBeenCalledWith({payment_intent: "pi_1"}, {idempotencyKey: "ticket-refund:order-1"});
  });
});
