export const APPLICATION_QUEUE_STATUSES = ["draft", "pending_payment", "pending_review"] as const;
export type ApplicationQueueStatus = (typeof APPLICATION_QUEUE_STATUSES)[number];
export const APPLICATION_QUEUE_FILTERS = [...APPLICATION_QUEUE_STATUSES, "submitted"] as const;
export type ApplicationQueueFilter = (typeof APPLICATION_QUEUE_FILTERS)[number];

/** A view predicate, never a persisted application status. */
export function resolveApplicationQueueStatuses(filter: ApplicationQueueFilter): readonly ApplicationQueueStatus[] {
  return filter === "submitted" ? ["pending_review", "pending_payment"] : [filter];
}
