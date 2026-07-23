import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import type {Actor, AdminActor, MembershipStatus} from "@/lib/membership/lifecycle";

export const AT_RISK_SCORE_MAX = 20;
export const AT_RISK_TREND_MAX = 0;
export const AT_RISK_NO_LOGIN_DAYS = 90;
export const AT_RISK_RENEWAL_DAYS = 120;
export const AT_RISK_DAY_MS = 86_400_000;

export type AtRiskCandidate = Readonly<{
  profileId: string;
  displayName: string;
  companyName: string | null;
  planCode: string;
  status: MembershipStatus;
  score: number | null;
  trend: number | null;
  lastLoginAt: Date | null;
  renewalAt: Date | null;
}>;

export type AtRiskClassification = Readonly<{atRisk: boolean; branchA: boolean; branchB: boolean}>;
export type AtRiskEvidence = AtRiskClassification & Readonly<{
  scoreBelow: typeof AT_RISK_SCORE_MAX;
  trendBelow: typeof AT_RISK_TREND_MAX;
  noLoginWithinDays: typeof AT_RISK_NO_LOGIN_DAYS;
  renewalWithinDays: typeof AT_RISK_RENEWAL_DAYS;
  status: "active" | "past_due";
}>;
export type AtRiskMember = Omit<AtRiskCandidate, "status"> & Readonly<{
  status: "active" | "past_due";
  evidence: AtRiskEvidence;
}>;

export type AtRiskReader = Readonly<{listCandidates: (actor: AdminActor, input: Readonly<{asOf: Date}>) => Promise<readonly AtRiskCandidate[]>}>;

const optionsSchema = z.object({asOf: z.coerce.date()}).strict();
const defaultReader: AtRiskReader = {listCandidates: async (actor, input) =>
  (await import("@/lib/db/repos/engagement")).engagementRepository.listAtRiskCandidates(actor, input.asOf)};

export function classifyAtRisk(member: AtRiskCandidate, asOf = new Date()): AtRiskClassification {
  if (member.status !== "active" && member.status !== "past_due") return {atRisk: false, branchA: false, branchB: false};
  const branchA = member.score !== null && member.score < AT_RISK_SCORE_MAX && member.trend !== null && member.trend < AT_RISK_TREND_MAX;
  const noLoginCutoff = new Date(asOf.getTime() - AT_RISK_NO_LOGIN_DAYS * AT_RISK_DAY_MS);
  const renewalBefore = new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * AT_RISK_DAY_MS);
  const branchB = (member.lastLoginAt === null || member.lastLoginAt <= noLoginCutoff)
    && member.renewalAt !== null && member.renewalAt >= asOf && member.renewalAt <= renewalBefore;
  return {atRisk: branchA || branchB, branchA, branchB};
}

export async function listAtRiskMembers(actor: Actor, input: unknown, reader: AtRiskReader = defaultReader): Promise<readonly AtRiskMember[]> {
  requireAdmin(actor);
  const {asOf} = optionsSchema.parse(input);
  const candidates = await reader.listCandidates(actor, {asOf});
  return candidates.map((member) => ({member, classification: classifyAtRisk(member, asOf)}))
    .filter((entry): entry is Readonly<{member: AtRiskCandidate & {status: "active" | "past_due"}; classification: AtRiskClassification}> => entry.classification.atRisk)
    .map(({member, classification}) => ({...member, evidence: {...classification, scoreBelow: AT_RISK_SCORE_MAX, trendBelow: AT_RISK_TREND_MAX, noLoginWithinDays: AT_RISK_NO_LOGIN_DAYS, renewalWithinDays: AT_RISK_RENEWAL_DAYS, status: member.status} as AtRiskEvidence}))
    .sort((left, right) => (left.renewalAt?.getTime() ?? Number.POSITIVE_INFINITY) - (right.renewalAt?.getTime() ?? Number.POSITIVE_INFINITY) || left.profileId.localeCompare(right.profileId));
}