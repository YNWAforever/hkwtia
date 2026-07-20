export const REPORT_TIMEZONE = "Asia/Hong_Kong" as const;

export type ReportDisplayWindow = Readonly<{
  from: string;
  to: string;
  timezone: typeof REPORT_TIMEZONE;
}>;

export type ReconciledMetric = Readonly<{
  numerator: number;
  denominator: number;
  percentage: number | null;
}>;

export type RevenueMembershipFact = Readonly<{
  status: string;
  interval: "annual" | "monthly" | "none";
  annualPriceHkd: number | null;
  monthlyPriceHkd: number | null;
  count?: number;
}>;

export type RenewalEventFact = Readonly<{
  membershipId: string;
  renewalOrdinal: number;
  type: "renewal_paid" | "renewal_failed";
}>;

export type RawReportFacts = Readonly<{
  revenueMemberships: readonly RevenueMembershipFact[];
  renewal: Readonly<{paid: number; due: number; firstYearPaid: number; firstYearDue: number}>;
  funnel: Readonly<{started: number; profileCompleted: number; checkoutOrReview: number; activated: number}>;
  attendance: Readonly<{attended: number; eligible: number}>;
  atRiskCount: number;
}>;

export type AdminReport = Readonly<{
  window: ReportDisplayWindow;
  revenue: Readonly<{arrHkd: number; mrrHkd: number}>;
  renewal: ReconciledMetric;
  firstYearRenewal: ReconciledMetric;
  funnel: Readonly<{started: number; profileCompleted: number; checkoutOrReview: number; activated: number}>;
  attendance: ReconciledMetric;
  atRiskCount: number;
}>;

export function recurringRevenue(memberships: readonly RevenueMembershipFact[]): AdminReport["revenue"] {
  const annualized = memberships.reduce((total, membership) => {
    if (membership.status !== "active") return total;
    const count = membership.count ?? 1;
    if (membership.interval === "annual") return total + ((membership.annualPriceHkd ?? 0) * count);
    if (membership.interval === "monthly") return total + ((membership.monthlyPriceHkd ?? 0) * 12 * count);
    return total;
  }, 0);
  const arrHkd = Math.round(annualized);
  return {arrHkd, mrrHkd: Math.round(annualized / 12)};
}

export function rate(input: Readonly<{numerator: number; denominator: number}>): ReconciledMetric {
  const {numerator, denominator} = input;
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator < 0 || numerator > denominator) {
    throw new Error("INVALID_RECONCILIATION");
  }
  return {numerator, denominator, percentage: denominator === 0 ? null : Math.round((numerator / denominator) * 1_000) / 10};
}

export function reconcileRenewalEvents(events: readonly RenewalEventFact[]): RawReportFacts["renewal"] {
  const dueMemberships = new Set<string>();
  const paidMemberships = new Set<string>();
  const firstYearDueMemberships = new Set<string>();
  const firstYearPaidMemberships = new Set<string>();
  for (const event of events) {
    dueMemberships.add(event.membershipId);
    if (event.type === "renewal_paid") paidMemberships.add(event.membershipId);
    if (event.renewalOrdinal === 1) {
      firstYearDueMemberships.add(event.membershipId);
      if (event.type === "renewal_paid") firstYearPaidMemberships.add(event.membershipId);
    }
  }
  return {paid: paidMemberships.size, due: dueMemberships.size, firstYearPaid: firstYearPaidMemberships.size, firstYearDue: firstYearDueMemberships.size};
}

export function reconcileReportFacts(facts: RawReportFacts, window: ReportDisplayWindow): AdminReport {
  return {
    window,
    revenue: recurringRevenue(facts.revenueMemberships),
    renewal: rate({numerator: facts.renewal.paid, denominator: facts.renewal.due}),
    firstYearRenewal: rate({numerator: facts.renewal.firstYearPaid, denominator: facts.renewal.firstYearDue}),
    funnel: facts.funnel,
    attendance: rate({numerator: facts.attendance.attended, denominator: facts.attendance.eligible}),
    atRiskCount: facts.atRiskCount,
  };
}
