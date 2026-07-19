import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import type {Actor, AdminActor, MembershipStatus} from "@/lib/membership/lifecycle";

export const AT_RISK_SCORE_MAX = 20;
export const AT_RISK_RENEWAL_DAYS = 60;
const DAY_MS = 86_400_000;

export type AtRiskCandidate = Readonly<{
  profileId: string;
  displayName: string;
  companyName: string | null;
  planCode: string;
  status: MembershipStatus;
  score: number;
  trend: number | null;
  renewalAt: Date | null;
}>;

export type AtRiskMember = Omit<AtRiskCandidate, "status" | "renewalAt"> & Readonly<{
  status: "active" | "past_due";
  renewalAt: Date;
  evidence: Readonly<{scoreBelow: typeof AT_RISK_SCORE_MAX; renewalWithinDays: typeof AT_RISK_RENEWAL_DAYS; status: "active" | "past_due"}>;
}>;

export type AtRiskReader = Readonly<{listCandidates: (actor: AdminActor, input: Readonly<{asOf: Date; renewalBefore: Date}>) => Promise<readonly AtRiskCandidate[]>}>;

const optionsSchema = z.object({asOf: z.coerce.date()}).strict();
const defaultReader: AtRiskReader = {listCandidates: async (actor, input) =>
  (await import("@/lib/db/repos/engagement")).engagementRepository.listAtRiskCandidates(actor, input.asOf)};

export function classifyAtRisk(member: AtRiskCandidate, asOf = new Date()): boolean {
  if (member.status !== "active" && member.status !== "past_due") return false;
  if (member.score >= AT_RISK_SCORE_MAX || !member.renewalAt) return false;
  const days = (member.renewalAt.getTime() - asOf.getTime()) / DAY_MS;
  return days >= 0 && days <= AT_RISK_RENEWAL_DAYS;
}

export async function listAtRiskMembers(actor: Actor, input: unknown, reader: AtRiskReader = defaultReader): Promise<readonly AtRiskMember[]> {
  requireAdmin(actor);
  const {asOf} = optionsSchema.parse(input);
  const renewalBefore = new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * DAY_MS);
  const candidates = await reader.listCandidates(actor, {asOf, renewalBefore});
  return candidates.filter((member): member is AtRiskCandidate & {renewalAt: Date; status: "active" | "past_due"} => classifyAtRisk(member, asOf))
    .map((member) => ({...member, evidence: {scoreBelow: AT_RISK_SCORE_MAX, renewalWithinDays: AT_RISK_RENEWAL_DAYS, status: member.status} as const}))
    .sort((left, right) => left.renewalAt.getTime() - right.renewalAt.getTime() || left.profileId.localeCompare(right.profileId));
}
