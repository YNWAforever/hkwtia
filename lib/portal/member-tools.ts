import type {MemberTool} from "@/config/member-tools";
import type {MembershipPlanCode} from "@/lib/membership/constants";

/**
 * Whether a member may open a tool.
 *
 * The registry's `tiers` is the single authority. `entitlements.memberTools` remains the
 * plan-level statement `/membership` mirrors, and a unit test holds every tool's tiers to
 * plans whose entitlements say `included`, so the two vocabularies cannot drift apart.
 */
export function isToolAvailable(tool: MemberTool, plans: readonly MembershipPlanCode[]): boolean {
  return tool.tiers.some((tier) => plans.includes(tier));
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
