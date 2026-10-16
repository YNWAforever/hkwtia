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

/**
 * The plans a tool is included with, as one readable phrase fragment ("Startup, Corporate and
 * Patron"). `Intl.ListFormat` supplies the locale's own conjunction, so the zh-HK page does not
 * inherit an English "and"; bare `en` is formatted as `en-GB` because the site writes "A, B and C"
 * without the Oxford comma that `en` (US) inserts. The plan names themselves come from the caller's translations.
 */
export function toolPlanList(tool: MemberTool, locale: string, planName: (plan: MembershipPlanCode) => string): string {
  return new Intl.ListFormat(locale === "en" ? "en-GB" : locale, {style: "long", type: "conjunction"}).format(tool.tiers.map(planName));
}
