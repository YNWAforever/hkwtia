import type {AppLocale} from "@/i18n/routing";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

export type PlanChooserItem = Readonly<{code: MembershipPlanCode; href: string; kind: "join" | "contact"}>;

/**
 * Bare /join used to render "This membership plan is unavailable" (audit F8)
 * because every header, footer and homepage CTA links to it without ?plan=.
 * Patron used to leave the site for /contact. It now stays on /join so the
 * organisation track can collect company details before review.
 */
export function planChooserItems(locale: AppLocale): readonly PlanChooserItem[] {
  return MEMBERSHIP_PLAN_CODES.map((code) => ({
    code,
    href: `${localizedPath(locale, "/join")}?plan=${code}`,
    kind: "join" as const,
  }));
}
