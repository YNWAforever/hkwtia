import {sql, type SQL} from "drizzle-orm";

/** The existing list priority, shared with Member 360. This is display order, not benefit eligibility. */
const priority: Readonly<Record<string, number>> = {
  active: 0, past_due: 1, cancel_at_period_end: 2, pending_review: 3,
  pending_payment: 4, cancelled: 5, expired: 6,
};

export type MembershipSummaryCandidate = Readonly<{id: string; status: string; companyId: string | null}>;

export function membershipSummaryOrderSql(status: SQL): SQL {
  return sql`CASE ${status}
    WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'cancel_at_period_end' THEN 2
    WHEN 'pending_review' THEN 3 WHEN 'pending_payment' THEN 4
    WHEN 'cancelled' THEN 5 WHEN 'expired' THEN 6 ELSE 7 END`;
}

export function membershipSummaryOrder(a: MembershipSummaryCandidate, b: MembershipSummaryCandidate): number {
  return (priority[a.status] ?? 7) - (priority[b.status] ?? 7)
    || a.id.localeCompare(b.id)
    || (a.companyId ?? "\uffff").localeCompare(b.companyId ?? "\uffff");
}
