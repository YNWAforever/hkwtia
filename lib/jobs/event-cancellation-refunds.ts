import "server-only";

import {systemActor} from "@/lib/auth/authorize";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {RUNNER_BATCH_LIMIT} from "@/lib/jobs/limits";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type EventCancellationRefundDependencies = Readonly<{
  listOrders: (limit: number) => Promise<readonly Readonly<{orderId: string; eventId: string}>[]>;
  refundOrder: (actor: ReturnType<typeof systemActor>, input: Readonly<{orderId: string; note?: string | null}>) => Promise<RefundResult>;
}>;

export type EventCancellationRefundSummary = Readonly<{
  scanned: number; refunded: number; alreadyRefunded: number; failed: number;
}>;

/**
 * Refund every order still owed money because its event was cancelled.
 *
 * Nothing here throws for a single order's failure: a provider refusal leaves
 * that order `paid`, which is exactly what makes the next run retry it. Throwing
 * would abort the batch and strand the orders behind the one that failed.
 */
export async function runEventCancellationRefunds(
  now: Date,
  dependencies: EventCancellationRefundDependencies = {
    listOrders: (limit) => eventOrdersRepository.ordersAwaitingCancellationRefund(limit),
    refundOrder: (actor, input) => refundOrder(actor, input),
  },
): Promise<EventCancellationRefundSummary> {
  const orders = await dependencies.listOrders(RUNNER_BATCH_LIMIT);
  const actor = systemActor("event-cancellation");
  let refunded = 0;
  let alreadyRefunded = 0;
  let failed = 0;

  for (const order of orders) {
    const result = await dependencies.refundOrder(actor, {orderId: order.orderId, note: "Event cancelled"});
    if (result.status === "refunded") refunded += 1;
    else if (result.status === "already_refunded") alreadyRefunded += 1;
    else if (result.status !== "not_found") failed += 1;
  }

  return {scanned: orders.length, refunded, alreadyRefunded, failed};
}
