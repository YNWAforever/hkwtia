import {describe, expect, it, vi} from "vitest";
import {systemActor} from "@/lib/auth/authorize";
import {processRefundSuccess} from "@/lib/billing/refund-success";
import type {OrderRecord} from "@/lib/db/repos/event-orders";

const order: OrderRecord = {
  id: "33333333-3333-4333-8333-333333333333", eventId: "event-1", buyerProfileId: null,
  buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", amountHkdCents: 25_000,
  currency: "hkd", status: "paid", stripeCheckoutSessionId: "cs_ticket", stripeCheckoutUrl: null,
  idempotencyKey: "idem", expiresAt: new Date("2026-09-25T00:00:00Z"), paidAt: new Date("2026-09-25T00:00:00Z"),
  refundedAt: null, refundReason: null,
};
const command = {eventId: "evt_success", refundId: "re_success", paymentIntentId: "pi_ticket",
  orderId: order.id, amountHkdCents: 25_000, refundReason: "cancelled" as const};

function dependencies(current: OrderRecord = order) {
  return {
    orders: {orderById: vi.fn(async () => current), reconcileRefundedOrder: vi.fn(async () => true)},
    stripe: {paymentIntentForSession: vi.fn(async () => "pi_ticket"), fullyRefundedPaymentIntent: vi.fn(async () => true),
      ticketOrderIdForPaymentIntent: vi.fn(async (): Promise<string | null> => order.id)},
    sendRefundEmail: vi.fn(async () => undefined),
    now: () => new Date("2026-09-25T02:00:00Z"),
  };
}

describe("successful ticket refund reconciliation", () => {
  it("commits a pending full refund after proving its checkout payment and amount", async () => {
    const deps = dependencies();
    await expect(processRefundSuccess(systemActor("stripe-webhook"), command, deps)).resolves.toBe("processed");
    expect(deps.stripe.fullyRefundedPaymentIntent).toHaveBeenCalledWith("pi_ticket", 25_000);
    expect(deps.orders.reconcileRefundedOrder).toHaveBeenCalledWith(order.id, expect.objectContaining({
      expectedAmountHkdCents: 25_000, refundReason: "cancelled", stripeEventId: "evt_success",
    }));
    expect(deps.sendRefundEmail).toHaveBeenCalledTimes(1);
  });

  it("repairs refund_failed and sends a distinct correction after the failure notice", async () => {
    const deps = dependencies({...order, status: "refund_failed", refundReason: "staff"});
    await processRefundSuccess(systemActor("stripe-webhook"), command, deps);
    expect(deps.orders.reconcileRefundedOrder).toHaveBeenCalledWith(order.id, expect.objectContaining({refundReason: "staff"}));
    expect(deps.sendRefundEmail).toHaveBeenCalledWith(expect.anything(), `ticket-refund-recovered:${order.id}:evt_success`);
  });

  it("ignores an unrelated refund without a ticket checkout", async () => {
    const deps = dependencies();
    deps.stripe.ticketOrderIdForPaymentIntent.mockResolvedValue(null);
    await expect(processRefundSuccess(systemActor("stripe-webhook"), {...command, orderId: null}, deps))
      .resolves.toBe("processed");
    expect(deps.orders.orderById).not.toHaveBeenCalled();
    expect(deps.orders.reconcileRefundedOrder).not.toHaveBeenCalled();
  });

  it("rejects a mismatched payment and never writes or emails", async () => {
    const deps = dependencies();
    deps.stripe.paymentIntentForSession.mockResolvedValue("pi_other");
    await expect(processRefundSuccess(systemActor("stripe-webhook"), command, deps))
      .rejects.toMatchObject({code: "INVALID_WEBHOOK_EVENT"});
    expect(deps.orders.reconcileRefundedOrder).not.toHaveBeenCalled();
    expect(deps.sendRefundEmail).not.toHaveBeenCalled();
  });

  it("leaves an incomplete provider refund uncommitted for webhook retry", async () => {
    const deps = dependencies();
    deps.stripe.fullyRefundedPaymentIntent.mockResolvedValue(false);
    await expect(processRefundSuccess(systemActor("stripe-webhook"), command, deps)).rejects.toThrow();
    expect(deps.orders.reconcileRefundedOrder).not.toHaveBeenCalled();
  });
});
