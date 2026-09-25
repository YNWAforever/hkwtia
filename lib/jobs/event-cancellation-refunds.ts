import "server-only";

import {systemActor} from "@/lib/auth/authorize";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {RUNNER_BATCH_LIMIT} from "@/lib/jobs/limits";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type EventCancellationRefundDependencies = Readonly<{
  listOrders: (limit: number) => Promise<readonly Readonly<{orderId: string; eventId: string}>[]>;
  deferFailedOrder: (orderId: string) => Promise<void>;
  refundOrder: (actor: ReturnType<typeof systemActor>, input: Readonly<{orderId: string; note?: string | null}>) => Promise<RefundResult>;
}>;

/**
 * Every outcome a run can produce, each in its own bucket so the tallies
 * reconcile: `scanned === refunded + alreadyRefunded + failed + notAdmissible +
 * notFound`.
 *
 * `failed` folds `provider_failed` and `commit_failed` together on purpose --
 * both leave the order `paid`, which is what makes the next run retry it -- and
 * is distinct from `notAdmissible`, where the order was not `paid` to begin with
 * and so will not be retried.
 */
export type EventCancellationRefundSummary = Readonly<{
  scanned: number;
  refunded: number;
  alreadyRefunded: number;
  failed: number;
  /** Subset of failed: provider accepted the refund but the DB commit did not. */
  commitFailed: number;
  notAdmissible: number;
  notFound: number;
}>;

/** The job handler turns this into a failed run and the Worker raises an alert. */
export class EventCancellationRefundBatchError extends Error {
  constructor(readonly summary: EventCancellationRefundSummary) {
    super("EVENT_CANCELLATION_REFUNDS_FAILED");
  }
}

/**
 * Attempt the whole bounded batch, then fail the job if any order still needs
 * attention. Failed orders stay paid and move behind untouched work by their
 * existing updated_at timestamp, so a full batch of persistent failures cannot
 * starve later orders. No additional progress table or migration is needed.
 */
export async function runEventCancellationRefunds(
  dependencies: EventCancellationRefundDependencies = {
    listOrders: (limit) => eventOrdersRepository.ordersAwaitingCancellationRefund(limit),
    deferFailedOrder: (orderId) => eventOrdersRepository.deferFailedCancellationRefund(orderId),
    refundOrder: (actor, input) => refundOrder(actor, input),
  },
): Promise<EventCancellationRefundSummary> {
  const orders = await dependencies.listOrders(RUNNER_BATCH_LIMIT);
  const actor = systemActor("event-cancellation");
  let refunded = 0;
  let alreadyRefunded = 0;
  let failed = 0;
  let commitFailed = 0;
  let notAdmissible = 0;
  let notFound = 0;

  for (const order of orders) {
    const result = await dependencies.refundOrder(actor, {orderId: order.orderId, note: "Event cancelled"});
    if (result.status === "refunded") refunded += 1;
    else if (result.status === "already_refunded") alreadyRefunded += 1;
    else if (result.status === "not_admissible") notAdmissible += 1;
    else if (result.status === "not_found") notFound += 1;
    else {
      failed += 1;
      if (result.status === "commit_failed") commitFailed += 1;
      await dependencies.deferFailedOrder(order.orderId);
    }
  }

  const summary = {scanned: orders.length, refunded, alreadyRefunded, failed, commitFailed, notAdmissible, notFound};
  if (failed > 0) {
    console.error("event-cancellation-refunds", {summary});
    throw new EventCancellationRefundBatchError(summary);
  }
  return summary;
}
