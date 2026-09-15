import "server-only";

import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {eventOrdersRepository, type EventOrdersRepository} from "@/lib/db/repos/event-orders";
import type {AdminActor} from "@/lib/membership/lifecycle";

export type RefundResult =
  | Readonly<{status: "refunded"}>
  | Readonly<{status: "already_refunded"}>
  | Readonly<{status: "not_admissible"}>
  | Readonly<{status: "provider_failed"}>
  | Readonly<{status: "not_found"}>;

export type RefundDependencies = Readonly<{
  orders: Pick<EventOrdersRepository, "orderById" | "refundPaidOrder">;
  stripe: Pick<StripeBillingAdapter, "paymentIntentForSession" | "refundPaymentIntent">;
  now: () => Date;
}>;

function defaultDependencies(): RefundDependencies {
  return {orders: eventOrdersRepository, stripe: stripeBillingAdapter(), now: () => new Date()};
}

/**
 * Refund one whole order. The provider is called BEFORE anything is written, so
 * a refusal leaves the order `paid` and the action retryable; the deterministic
 * key makes that retry safe even if the provider succeeded and our commit did
 * not, because the provider returns the same refund rather than a second one.
 */
export async function refundOrder(
  actor: AdminActor,
  input: Readonly<{orderId: string; note?: string | null}>,
  dependencies: RefundDependencies = defaultDependencies(),
): Promise<RefundResult> {
  const order = await dependencies.orders.orderById(input.orderId);
  if (!order) return {status: "not_found"};
  if (order.status === "refunded") return {status: "already_refunded"};
  if (order.status !== "paid") return {status: "not_admissible"};
  if (!order.stripeCheckoutSessionId) return {status: "provider_failed"};

  let paymentIntentId: string | null;
  try {
    paymentIntentId = await dependencies.stripe.paymentIntentForSession(order.stripeCheckoutSessionId);
  } catch {
    // A read that failed is not a refund that failed, but the caller cannot tell
    // them apart, and claiming nothing happened is the honest answer either way.
    return {status: "provider_failed"};
  }
  if (!paymentIntentId) return {status: "provider_failed"};

  try {
    await dependencies.stripe.refundPaymentIntent(paymentIntentId, `ticket-refund:${order.id}`);
  } catch {
    return {status: "provider_failed"};
  }

  const committed = await dependencies.orders.refundPaidOrder(order.id, {
    refundedAt: dependencies.now(),
    actorUserId: actor.userId,
    actorType: actor.kind,
    note: input.note ?? null,
  });
  return committed ? {status: "refunded"} : {status: "already_refunded"};
}
