import type {DashboardMembership} from "@/lib/portal/queries";

const primaryRank: Record<DashboardMembership["status"], number> = {
  active: 5, past_due: 4, cancel_at_period_end: 3, pending_review: 2, pending_payment: 1,
};
const issueRank: Record<DashboardMembership["status"], number> = {
  past_due: 3, pending_payment: 2, pending_review: 1, active: 0, cancel_at_period_end: 0,
};
export type MembershipIssue = DashboardMembership & {status: "past_due" | "pending_payment" | "pending_review"};

function compareIds(a: DashboardMembership, b: DashboardMembership): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Repository ordering must not change which record supplies the entire summary. */
export function choosePrimaryMembership(rows: readonly DashboardMembership[]): DashboardMembership | null {
  return [...rows].sort((a, b) => primaryRank[b.status] - primaryRank[a.status] || compareIds(a, b))[0] ?? null;
}

/** An active membership never hides another membership's payment or review issue. */
export function getMembershipIssues(rows: readonly DashboardMembership[]): MembershipIssue[] {
  return rows.filter((row): row is MembershipIssue => issueRank[row.status] > 0)
    .sort((a, b) => issueRank[b.status] - issueRank[a.status] || compareIds(a, b));
}
