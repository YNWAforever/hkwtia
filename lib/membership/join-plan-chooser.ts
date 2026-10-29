import {OPS_MEMBERSHIP_TIERS, type OpsMembershipCode} from "@/config/membership-journey";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type PlanChooserItem = Readonly<{code: OpsMembershipCode; href: string; kind: "join"; annualPriceHkd: number}>;

/**
 * Bare /join used to render "This membership plan is unavailable" (audit F8)
 * because every header, footer and homepage CTA links to it without ?plan=.
 * The chooser is the ops list only: Individual, Corporate, Platinum. All three pay first.
 */
export function planChooserItems(locale: AppLocale): readonly PlanChooserItem[] {
  return OPS_MEMBERSHIP_TIERS.map((tier) => ({
    code: tier.code,
    href: `${localizedPath(locale, "/join")}?plan=${tier.code}`,
    kind: "join" as const,
    annualPriceHkd: tier.annualPriceHkd,
  }));
}
