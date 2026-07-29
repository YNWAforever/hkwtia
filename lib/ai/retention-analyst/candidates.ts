import {
  classifyAtRisk,
  type AtRiskCandidate,
} from "@/lib/admin/at-risk";

export type RetentionRiskCode =
  | "low_score_declining"
  | "inactive_before_renewal";

export type RetentionCandidate = Readonly<{
  profileId: string;
  membershipId: string;
  locale: "en" | "zh-HK";
  planCode: string;
  renewalDate: string | null;
  score: number | null;
  trend: "up" | "flat" | "down" | null;
  riskCodes: RetentionRiskCode[];
}>;

export type RetentionCandidateSource = Readonly<{
  profileId: string;
  membershipId: string;
  locale: string | null;
  planCode: string;
  status: AtRiskCandidate["status"];
  renewalAt: Date | null;
  score: number | null;
  trend: number | null;
  lastLoginAt: Date | null;
}>;

function localeFrom(value: string | null): RetentionCandidate["locale"] {
  return value === "en" ? "en" : "zh-HK";
}

function trendFrom(value: number | null): RetentionCandidate["trend"] {
  if (value === null) return null;
  if (value < 0) return "down";
  if (value > 0) return "up";
  return "flat";
}

function renewalDateFrom(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function compareRenewalDates(left: string | null, right: string | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function deduplicateRetentionCandidates(
  candidates: readonly RetentionCandidate[],
): readonly RetentionCandidate[] {
  const seenProfiles = new Set<string>();
  return [...candidates]
    .sort((left, right) =>
      left.profileId.localeCompare(right.profileId)
      || compareRenewalDates(left.renewalDate, right.renewalDate)
      || left.membershipId.localeCompare(right.membershipId)
    )
    .filter((candidate) => {
      if (seenProfiles.has(candidate.profileId)) return false;
      seenProfiles.add(candidate.profileId);
      return true;
    });
}

export function projectRetentionCandidates(
  sources: readonly RetentionCandidateSource[],
  asOf: Date,
): readonly RetentionCandidate[] {
  return deduplicateRetentionCandidates(sources.flatMap((source) => {
    const classification = classifyAtRisk({
      profileId: source.profileId,
      membershipId: source.membershipId,
      displayName: "",
      companyName: null,
      planCode: source.planCode,
      status: source.status,
      score: source.score,
      trend: source.trend,
      lastLoginAt: source.lastLoginAt,
      renewalAt: source.renewalAt,
    }, asOf);
    if (!classification.atRisk) return [];

    const riskCodes: RetentionRiskCode[] = [];
    if (classification.branchA) riskCodes.push("low_score_declining");
    if (classification.branchB) riskCodes.push("inactive_before_renewal");

    return [{
      profileId: source.profileId,
      membershipId: source.membershipId,
      locale: localeFrom(source.locale),
      planCode: source.planCode,
      renewalDate: renewalDateFrom(source.renewalAt),
      score: source.score,
      trend: trendFrom(source.trend),
      riskCodes,
    }];
  }));
}
