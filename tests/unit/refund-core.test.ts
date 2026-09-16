import {describe, expect, it, vi} from "vitest";

import {refundOrder, type RefundDependencies} from "@/lib/tickets/refund-core";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const orderId = "b1a2c3d4-1111-4222-8333-944455566677";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId, eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", buyerProfileId: null,
    buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en" as const,
    amountHkdCents: 50_000, currency: "hkd", status: "paid" as const,
    stripeCheckoutSessionId: "cs_test_1", stripeCheckoutUrl: "https://checkout.stripe.test/1",
    idempotencyKey: "idem-1", expiresAt: new Date("2026-09-16T10:30:00Z"),
    paidAt: new Date("2026-09-16T10:00:00Z"), refundedAt: null, refundReason: null,
    ...overrides,
  };
}

function dependencies(overrides: Partial<RefundDependencies> = {}): RefundDependencies {
  return {
    orders: {
      orderById: vi.fn(async () => order()),
      refundPaidOrder: vi.fn(async () => true),
    },
    stripe: {
      paymentIntentForSession: vi.fn(async () => "pi_1"),
      refundPaymentIntent: vi.fn(async () => undefined),
    },
    sendRefundEmail: vi.fn(async () => undefined),
    now: () => new Date("2026-09-16T12:00:00Z"),
    ...overrides,
  };
}

describe("refundOrder", () => {
  it("refunds a paid order through the provider, then commits the refund with the note", async () => {
    const deps = dependencies();

    const result = await refundOrder(staff, {orderId, note: "Duplicate purchase"}, deps);

    expect(result).toEqual({status: "refunded"});
    expect(vi.mocked(deps.stripe.paymentIntentForSession)).toHaveBeenCalledWith("cs_test_1");
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).toHaveBeenCalledWith("pi_1", `ticket-refund:${orderId}`);
    const commit = vi.mocked(deps.orders.refundPaidOrder).mock.calls[0]![1] as Record<string, unknown>;
    expect(commit).toMatchObject({
      refundedAt: new Date("2026-09-16T12:00:00Z"),
      actorUserId: "auth-1",
      actorType: "staff",
      note: "Duplicate purchase",
    });
    expect(commit).not.toHaveProperty("refundReason");
  });

  it("refuses an order that is not paid, without touching the provider", async () => {
    const deps = dependencies({
      orders: {
        orderById: vi.fn(async () => order({status: "pending"})),
        refundPaidOrder: vi.fn(async () => true),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "not_admissible"});
    expect(vi.mocked(deps.stripe.paymentIntentForSession)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  it("reports an already-refunded order without touching the provider", async () => {
    const deps = dependencies({
      orders: {
        orderById: vi.fn(async () => order({status: "refunded", refundReason: "staff"})),
        refundPaidOrder: vi.fn(async () => true),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "already_refunded"});
    expect(vi.mocked(deps.stripe.paymentIntentForSession)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  it("reports an unknown order as not found", async () => {
    const deps = dependencies({
      orders: {
        orderById: vi.fn(async () => null),
        refundPaidOrder: vi.fn(async () => true),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "not_found"});
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  it("writes nothing when the provider throws, leaving the order paid and retryable", async () => {
    const deps = dependencies({
      stripe: {
        paymentIntentForSession: vi.fn(async () => "pi_1"),
        refundPaymentIntent: vi.fn(async () => {
          throw new Error("stripe_down");
        }),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "provider_failed"});
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  it("reports already_refunded when the conditional commit loses the race", async () => {
    const deps = dependencies({
      orders: {
        orderById: vi.fn(async () => order()),
        refundPaidOrder: vi.fn(async () => false),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "already_refunded"});
  });

  it("fails closed when the session carries no payment intent", async () => {
    const deps = dependencies({
      stripe: {
        paymentIntentForSession: vi.fn(async () => null),
        refundPaymentIntent: vi.fn(async () => undefined),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "provider_failed"});
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  it("fails closed when reading the payment intent throws", async () => {
    const deps = dependencies({
      stripe: {
        paymentIntentForSession: vi.fn(async () => {
          throw new Error("stripe_read_down");
        }),
        refundPaymentIntent: vi.fn(async () => undefined),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "provider_failed"});
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.orders.refundPaidOrder)).not.toHaveBeenCalled();
  });

  // The interleaving the five-outcome union had no word for: the provider
  // refunded, but our commit threw. Staff must be told the money may have moved
  // rather than handed a generic 500 that invites a blind retry.
  it("reports commit_failed when the provider succeeded but the commit threw", async () => {
    const deps = dependencies({
      orders: {
        orderById: vi.fn(async () => order()),
        refundPaidOrder: vi.fn(async () => {
          throw new Error("db_down");
        }),
      },
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "commit_failed"});
    expect(vi.mocked(deps.stripe.refundPaymentIntent)).toHaveBeenCalledTimes(1);
    // Nothing was recorded, so no refund email is claimed.
    expect(vi.mocked(deps.sendRefundEmail)).not.toHaveBeenCalled();
  });

  it("emails the buyer once after a committed refund", async () => {
    const deps = dependencies();

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "refunded"});
    expect(vi.mocked(deps.sendRefundEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.sendRefundEmail).mock.calls[0]![0]).toMatchObject({id: orderId, buyerLocale: "en", amountHkdCents: 50_000});
  });

  it("keeps the refunded outcome when the refund email cannot be sent", async () => {
    const deps = dependencies({
      sendRefundEmail: vi.fn(async () => {
        throw new Error("mail_down");
      }),
    });

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "refunded"});
    expect(vi.mocked(deps.orders.refundPaidOrder)).toHaveBeenCalledTimes(1);
  });
});
