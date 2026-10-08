export type BillingPeriodLine = Readonly<{kind: "renews" | "ends"; date: Date}>;

// A membership set to cancel at period end stops on that date rather than renewing; the line
// says which, so "Manage billing" never has to be opened just to learn it.
// Only these statuses have a period end that is true to say aloud; a pending or cancelled membership
// can still carry a stale date from an earlier subscription. A past-due membership is not "renewing"
// on its period end either; its card explains the failed payment instead (final review M12).
const PERIOD_STATUSES = new Set(["active", "cancel_at_period_end"]);

export function billingPeriodLine(record: Readonly<{billingPeriodEnd: Date | string | null; cancelAtPeriodEnd: boolean; status?: string}> | undefined): BillingPeriodLine | null {
  if (!record || record.billingPeriodEnd === null) return null;
  if (record.status !== undefined && !PERIOD_STATUSES.has(record.status)) return null;
  const date = record.billingPeriodEnd instanceof Date ? record.billingPeriodEnd : new Date(record.billingPeriodEnd);
  if (Number.isNaN(date.getTime())) return null;
  return {kind: record.cancelAtPeriodEnd || record.status === "cancel_at_period_end" ? "ends" : "renews", date};
}
