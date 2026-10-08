export type BillingPeriodLine = Readonly<{kind: "renews" | "ends"; date: Date}>;

// A membership set to cancel at period end stops on that date rather than renewing; the line
// says which, so "Manage billing" never has to be opened just to learn it.
export function billingPeriodLine(record: Readonly<{billingPeriodEnd: Date | string | null; cancelAtPeriodEnd: boolean}> | undefined): BillingPeriodLine | null {
  if (!record || record.billingPeriodEnd === null) return null;
  const date = record.billingPeriodEnd instanceof Date ? record.billingPeriodEnd : new Date(record.billingPeriodEnd);
  if (Number.isNaN(date.getTime())) return null;
  return {kind: record.cancelAtPeriodEnd ? "ends" : "renews", date};
}
