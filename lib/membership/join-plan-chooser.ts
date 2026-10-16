import type {AppLocale} from "@/i18n/routing";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

export type PlanChooserItem = Readonly<{code: MembershipPlanCode; href: string; kind: "join" | "contact"}>;

/**
 * Bare /join used to render "This membership plan is unavailable" (audit F8)
 * because every header, footer and homepage CTA links to it without ?plan=.
 * Patron is review-only (lib/membership/plans.ts billingBehavior "review"),
 * so it routes to /contact exactly as the /membership catalog does.
 */
export function planChooserItems(locale: AppLocale): readonly PlanChooserItem[] {
  return MEMBERSHIP_PLAN_CODES.map((code) => code === "patron"
    ? {code, href: localizedPath(locale, "/contact"), kind: "contact"}
    : {code, href: `${localizedPath(locale, "/join")}?plan=${code}`, kind: "join"});
}
