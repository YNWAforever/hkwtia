import {describe, expect, it, vi} from "vitest";

import {processRefundFailure} from "@/lib/billing/refund-failure";
import {systemActor} from "@/lib/auth/authorize";
import type {OrderRecord} from "@/lib/db/repos/event-orders";

const order: OrderRecord = {
  id: "33333333-3333-4333-8333-333333333333", eventId: "event-1", buyerProfileId: null,
  buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", amountHkdCents: 25_000,
  currency: "hkd", status: "refunded", stripeCheckoutSessionId: "cs_ticket", stripeCheckoutUrl: null,
  idempotencyKey: "idem", expiresAt: new Date("2026-09-25T00:00:00Z"), paidAt: new Date("2026-09-25T00:00:00Z"),
  refundedAt: new Date("2026-09-25T01:00:00Z"), refundReason: "staff",
};
const command = {eventId: "evt_failure", refundId: "re_failure", paymentIntentId: "pi_ticket",
  orderId: order.id, amountHkdCents: 25_000};

function dependencies(current = order) {
  return {
    orders: {orderById: vi.fn(async () => current), markRefundFailed: vi.fn(async () => true)},
    stripe: {paymentIntentForSession: vi.fn(async () => "pi_ticket"), fullyRefundedPaymentIntent: vi.fn(async () => false),
      ticketOrderIdForPaymentIntent: vi.fn(async (): Promise<string | null> => order.id)},
    sendFailureEmail: vi.fn(async () => undefined),
  };
}

describe("failed ticket refund reconciliation", () => {
  it("records a later provider failure after confirming the exact payment and remaining balance", async () => {
    const deps = dependencies();
    await expect(processRefundFailure(systemActor("stripe-webhook"), command, deps)).resolves.toBe("processed");
    expect(deps.stripe.paymentIntentForSession).toHaveBeenCalledWith("cs_ticket");
    expect(deps.stripe.fullyRefundedPaymentIntent).toHaveBeenCalledWith("pi_ticket", 25_000);
    expect(deps.orders.markRefundFailed).toHaveBeenCalledWith(order.id, command);
    expect(deps.sendFailureEmail).toHaveBeenCalledWith(order, command.eventId);
  });

  it("records a failed pending refund while preserving a still-paid ticket", async () => {
    const paid = {...order, status: "paid" as const, refundedAt: null, refundReason: null};
    const deps = dependencies(paid);
    await expect(processRefundFailure(systemActor("stripe-webhook"), command, deps)).resolves.toBe("processed");
    expect(deps.stripe.fullyRefundedPaymentIntent).toHaveBeenCalledWith("pi_ticket", 25_000);
    expect(deps.orders.markRefundFailed).toHaveBeenCalledWith(order.id, command);
    expect(deps.sendFailureEmail).toHaveBeenCalledWith(paid, command.eventId);
  });

  it("finds a pre-change refund through its verified Checkout Session", async () => {
    const deps = dependencies();
    await expect(processRefundFailure(systemActor("stripe-webhook"), {...command, orderId: null}, deps))
      .resolves.toBe("processed");
    expect(deps.stripe.ticketOrderIdForPaymentIntent).toHaveBeenCalledWith("pi_ticket");
    expect(deps.orders.markRefundFailed).toHaveBeenCalledWith(order.id, expect.objectContaining({refundId: "re_failure"}));
  });
  it("does not undo a later successful full refund", async () => {
    const deps = dependencies();
    deps.stripe.fullyRefundedPaymentIntent.mockResolvedValue(true);
    await expect(processRefundFailure(systemActor("stripe-webhook"), command, deps)).resolves.toBe("processed");
    expect(deps.orders.markRefundFailed).not.toHaveBeenCalled();
    expect(deps.sendFailureEmail).not.toHaveBeenCalled();
  });

  it("ignores an unrelated failed refund without a ticket checkout", async () => {
    const deps = dependencies();
    deps.stripe.ticketOrderIdForPaymentIntent.mockResolvedValue(null);
    await expect(processRefundFailure(systemActor("stripe-webhook"), {...command, orderId: null}, deps))
      .resolves.toBe("processed");
    expect(deps.orders.orderById).not.toHaveBeenCalled();
  });

  it("rejects a refund that points to another order's payment or amount", async () => {
    const deps = dependencies();
    deps.stripe.paymentIntentForSession.mockResolvedValue("pi_other");
    await expect(processRefundFailure(systemActor("stripe-webhook"), command, deps)).rejects.toMatchObject({code: "INVALID_WEBHOOK_EVENT"});
    expect(deps.orders.markRefundFailed).not.toHaveBeenCalled();
    expect(deps.sendFailureEmail).not.toHaveBeenCalled();
  });
});