import "server-only";

import {RefundPendingError, stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {sendOrderRefundEmail} from "@/lib/billing/ticket-webhook-processor";
import {eventOrdersRepository, type EventOrdersRepository, type OrderRecord, type RefundReason} from "@/lib/db/repos/event-orders";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type RefundResult =
  | Readonly<{status: "refunded"}>
  | Readonly<{status: "already_refunded"}>
  | Readonly<{status: "not_admissible"}>
  | Readonly<{status: "provider_failed"}>
  | Readonly<{status: "pending"}>
  | Readonly<{status: "commit_failed"}>
  | Readonly<{status: "not_found"}>;

export type RefundDependencies = Readonly<{
  orders: Pick<EventOrdersRepository, "orderById" | "refundPaidOrder"> & Partial<Pick<EventOrdersRepository, "reconcileRefundedOrder">>;
  stripe: Pick<StripeBillingAdapter, "paymentIntentForSession" | "refundPaymentIntent" | "fullyRefundedPaymentIntent">;
  /** Best-effort: the refund is already committed, so a mail failure is logged, not thrown. */
  sendRefundEmail: (order: OrderRecord, idempotencyKey?: string) => Promise<void>;
  now: () => Date;
}>;

/**
 * Who may refund. An admin acting from the panel, or the automated
 * event-cancellation sweep via `systemActor`. It is deliberately not a general
 * `Actor`: that union admits `anonymous`, so widening to it would let any public
 * caller refund with no authority named in the audit at all.
 */
type RefundActor = AdminActor | Extract<Actor, {kind: "system"}>;

function defaultDependencies(): RefundDependencies {
  return {
    orders: eventOrdersRepository,
    stripe: stripeBillingAdapter(),
    sendRefundEmail: (order, idempotencyKey) => sendOrderRefundEmail(order, undefined, idempotencyKey),
    now: () => new Date(),
  };
}

/**
 * Refund one whole order. The provider is called BEFORE anything is written, so
 * a refusal leaves the order `paid` and the action retryable.
 *
 * The deterministic refund key protects the provider request inside Stripe's
 * idempotency retention window. If the provider accepted the refund but our
 * commit failed, a later full-refund request is refused by Stripe; the catch
 * checks the expanded charge for the exact HKD amount before recording the
 * missing local transition. An unverified provider state stays provider_failed
 * and raises the cancellation job's alert.
 *
 * The buyer's refund email is sent only once the commit succeeds, best-effort:
 * a mail failure never changes the outcome of a completed refund.
 */
export async function refundOrder(
  actor: RefundActor,
  input: Readonly<{orderId: string; note?: string | null}>,
  dependencies: RefundDependencies = defaultDependencies(),
): Promise<RefundResult> {
  const order = await dependencies.orders.orderById(input.orderId);
  if (!order) return {status: "not_found"};
  if (order.status === "refunded") return {status: "already_refunded"};
  const recoveringFailure = order.status === "refund_failed";
  if (order.status !== "paid" && !recoveringFailure) return {status: "not_admissible"};
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

  // Verify the full charge before any new provider request. This repairs a
  // pending refund whose success webhook was missed and avoids a second refund
  // after the provider's idempotency window has expired.
  let providerReconciled: boolean;
  try {
    providerReconciled = await dependencies.stripe.fullyRefundedPaymentIntent(paymentIntentId, order.amountHkdCents);
  } catch {
    return {status: "provider_failed"};
  }
  if (recoveringFailure && !providerReconciled) return {status: "provider_failed"};
  if (!providerReconciled) {
    try {
      await dependencies.stripe.refundPaymentIntent(paymentIntentId, `ticket-refund:${order.id}`, {
        requireSucceeded: true, orderId: order.id, refundReason: actor.kind === "system" ? "cancelled" : "staff",
      });
    } catch (error) {
      if (error instanceof RefundPendingError || (error && typeof error === "object" && "code" in error && error.code === "STRIPE_REFUND_PENDING")) return {status: "pending"};
      try {
        if (!await dependencies.stripe.fullyRefundedPaymentIntent(paymentIntentId, order.amountHkdCents)) return {status: "provider_failed"};
        providerReconciled = true;
      } catch {
        return {status: "provider_failed"};
      }
    }
  }

  // The issuer's reason. A person's refund is `staff`; the cancellation sweep's
  // is the event being cancelled, and must not be recorded as a person's (D-4d
  // whole-branch finding). The column takes the enum member; the audit metadata
  // takes the more specific `event_cancelled` the enum cannot spell.
  const refundReason: RefundReason = recoveringFailure ? (order.refundReason ?? (actor.kind === "system" ? "cancelled" : "staff")) : actor.kind === "system" ? "cancelled" : "staff";
  const reason = providerReconciled ? "provider_reconciled" : actor.kind === "system" ? "event_cancelled" : "staff";

  let committed: boolean;
  try {
    const refundedAt = dependencies.now();
    if (recoveringFailure) {
      if (!dependencies.orders.reconcileRefundedOrder) return {status: "commit_failed"};
      committed = await dependencies.orders.reconcileRefundedOrder(order.id, {
        refundedAt, expectedAmountHkdCents: order.amountHkdCents,
        actorUserId: actor.userId, actorType: actor.kind, refundReason, reason,
        note: input.note ?? null, stripeEventId: null,
      });
    } else {
      committed = await dependencies.orders.refundPaidOrder(order.id, {
        refundedAt, actorUserId: actor.userId, actorType: actor.kind,
        refundReason, reason, note: input.note ?? null,
      });
    }
  } catch {
    // The provider may already have moved the money while the order is not
    // recorded. Do not claim a refund and do not email one: tell staff the
    // truth so they check the provider instead of retrying blind.
    return {status: "commit_failed"};
  }
  if (!committed) return {status: "already_refunded"};

  try {
    await dependencies.sendRefundEmail(order, recoveringFailure ? `ticket-refund-recovered:${order.id}:${dependencies.now().toISOString()}` : undefined);
  } catch {
    // The refund is committed; a mail failure must not undo it or change the outcome.
  }
  return {status: "refunded"};
}
