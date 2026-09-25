import "server-only";

import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {sendOrderRefundEmail} from "@/lib/billing/ticket-webhook-processor";
import {RefundFailureCorrelationError} from "@/lib/billing/refund-failure";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import type {Actor} from "@/lib/membership/lifecycle";
import type {OrderRecord, RefundReason, RefundReconciliationInput} from "@/lib/db/repos/event-orders";

export type RefundSuccessCommand = Readonly<{
  eventId: string; refundId: string; paymentIntentId: string; orderId: string | null;
  amountHkdCents: number; refundReason: RefundReason | null;
}>;
export type RefundSuccessDependencies = Readonly<{
  orders: {orderById(orderId: string): Promise<OrderRecord | null>;
    reconcileRefundedOrder(orderId: string, input: RefundReconciliationInput): Promise<boolean>};
  stripe: {paymentIntentForSession(sessionId: string): Promise<string | null>;
    fullyRefundedPaymentIntent(paymentIntentId: string, amountHkdCents: number): Promise<boolean>;
    ticketOrderIdForPaymentIntent(paymentIntentId: string): Promise<string | null>};
  sendRefundEmail: (order: OrderRecord, idempotencyKey?: string) => Promise<void>;
  now: () => Date;
}>;

function defaultDependencies(): RefundSuccessDependencies {
  return {
    orders: eventOrdersRepository,
    stripe: stripeBillingAdapter(),
    sendRefundEmail: (order, key) => sendOrderRefundEmail(order, undefined, key),
    now: () => new Date(),
  };
}

export async function processRefundSuccess(
  actor: Actor, command: RefundSuccessCommand,
  dependencies: RefundSuccessDependencies = defaultDependencies(),
): Promise<"processed" | "duplicate"> {
  if (actor.kind !== "system" || actor.source !== "stripe-webhook") throw new Error("FORBIDDEN");
  const orderId = command.orderId ?? await dependencies.stripe.ticketOrderIdForPaymentIntent(command.paymentIntentId);
  if (!orderId) return "processed";
  const order = await dependencies.orders.orderById(orderId);
  if (!order || !order.stripeCheckoutSessionId || order.currency !== "hkd" ||
      order.amountHkdCents !== command.amountHkdCents) throw new RefundFailureCorrelationError();
  const paymentIntentId = await dependencies.stripe.paymentIntentForSession(order.stripeCheckoutSessionId);
  if (paymentIntentId !== command.paymentIntentId) throw new RefundFailureCorrelationError();
  if (order.status === "refunded") return "duplicate";
  if (order.status !== "paid" && order.status !== "refund_failed") throw new Error("REFUND_ORDER_NOT_SETTLED");
  if (!await dependencies.stripe.fullyRefundedPaymentIntent(paymentIntentId, order.amountHkdCents)) {
    throw new Error("STRIPE_REFUND_NOT_SUCCEEDED");
  }
  const committed = await dependencies.orders.reconcileRefundedOrder(order.id, {
    refundedAt: dependencies.now(), expectedAmountHkdCents: order.amountHkdCents,
    actorUserId: null, actorType: "system",
    refundReason: order.refundReason ?? command.refundReason ?? "staff",
    reason: "provider_reconciled", note: null, stripeEventId: command.eventId,
  });
  if (!committed) return "duplicate";
  try {
    await dependencies.sendRefundEmail(order, order.status === "refund_failed"
      ? `ticket-refund-recovered:${order.id}:${command.eventId}` : undefined);
  } catch { /* A mail failure must not replay an already committed transition. */ }
  return "processed";
}
