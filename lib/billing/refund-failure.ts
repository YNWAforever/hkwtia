import "server-only";

import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {sendOrderRefundFailureEmail} from "@/lib/billing/ticket-webhook-processor";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import type {Actor} from "@/lib/membership/lifecycle";
import type {OrderRecord} from "@/lib/db/repos/event-orders";

export type RefundFailureCommand = Readonly<{eventId: string; refundId: string; paymentIntentId: string; orderId: string | null; amountHkdCents: number}>;
export type RefundFailureDependencies = Readonly<{
  orders: {orderById(orderId: string): Promise<OrderRecord | null>; markRefundFailed(orderId: string, command: RefundFailureCommand): Promise<boolean>};
  stripe: {paymentIntentForSession(sessionId: string): Promise<string | null>; fullyRefundedPaymentIntent(paymentIntentId: string, amountHkdCents: number): Promise<boolean>;
    ticketOrderIdForPaymentIntent(paymentIntentId: string): Promise<string | null>};
  sendFailureEmail: (order: OrderRecord, eventId: string) => Promise<void>;
}>;

export class RefundFailureCorrelationError extends Error {
  readonly code = "INVALID_WEBHOOK_EVENT";
  constructor() { super("INVALID_WEBHOOK_EVENT"); }
}

function defaultDependencies(): RefundFailureDependencies {
  return {orders: eventOrdersRepository, stripe: stripeBillingAdapter(), sendFailureEmail: sendOrderRefundFailureEmail};
}

/** Reconcile the provider first: a later successful refund must win over this old failure. */
export async function processRefundFailure(
  actor: Actor,
  command: RefundFailureCommand,
  dependencies: RefundFailureDependencies = defaultDependencies(),
): Promise<"processed" | "duplicate"> {
  if (actor.kind !== "system" || actor.source !== "stripe-webhook") throw new Error("FORBIDDEN");
  const orderId = command.orderId ?? await dependencies.stripe.ticketOrderIdForPaymentIntent(command.paymentIntentId);
  if (!orderId) return "processed";
  const order = await dependencies.orders.orderById(orderId);
  if (!order || !order.stripeCheckoutSessionId || order.amountHkdCents !== command.amountHkdCents || order.currency !== "hkd") {
    throw new RefundFailureCorrelationError();
  }
  const paymentIntentId = await dependencies.stripe.paymentIntentForSession(order.stripeCheckoutSessionId);
  if (paymentIntentId !== command.paymentIntentId) throw new RefundFailureCorrelationError();
  if (order.status === "refund_failed") return "duplicate";
  if (order.status !== "refunded") return "processed";
  if (await dependencies.stripe.fullyRefundedPaymentIntent(paymentIntentId, order.amountHkdCents)) return "processed";
  if (!await dependencies.orders.markRefundFailed(order.id, command)) return "duplicate";
  try { await dependencies.sendFailureEmail(order, command.eventId); }
  catch { /* The state is committed; a mail outage must not invite a webhook replay. */ }
  return "processed";
}