import type {MemberTool} from "@/config/member-tools";
import type {MembershipPlanCode, MembershipStatus} from "@/lib/membership/constants";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";

/**
 * Whether a member may open a tool.
 *
 * The registry's `tiers` is the single authority. `entitlements.memberTools` remains the
 * plan-level statement `/membership` mirrors, and a unit test holds every tool's tiers to
 * plans whose entitlements say `included`, so the two vocabularies cannot drift apart.
 */
export function isToolAvailable(tool: MemberTool, memberships: readonly Readonly<{planCode: MembershipPlanCode; status: MembershipStatus}>[]): boolean {
  return memberships.some((membership) => isBenefitEligibleMembershipStatus(membership.status) && tool.tiers.includes(membership.planCode));
}

/**
 * The iframe `src`: the tool's origin with its access token appended.
 *
 * `URLSearchParams` does the encoding, so a token containing `&`, spaces or anything else
 * cannot truncate the query or inject a second parameter.
 */
export function toolFrameSrc(tool: MemberTool, token: string): string {
  const url = new URL(tool.url);
  url.searchParams.set(tool.tokenParam, token);
  return url.toString();
}
