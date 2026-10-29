import {OPS_MEMBERSHIP_TIERS, type OpsMembershipCode} from "@/config/membership-journey";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type PlanChooserCode = "community" | OpsMembershipCode;
export type PlanChooserItem = Readonly<{code: PlanChooserCode; href: string; kind: "join"; annualPriceHkd: number | null}>;

/**
 * Bare /join used to render "This membership plan is unavailable" (audit F8)
 * because every header, footer and homepage CTA links to it without ?plan=.
 * Community is the free tier. Individual, Corporate, and Platinum stay pay-first.
 */
export function planChooserItems(locale: AppLocale): readonly PlanChooserItem[] {
  const join = localizedPath(locale, "/join");
  return [
    {code: "community", href: `${join}?plan=community`, kind: "join", annualPriceHkd: null},
    ...OPS_MEMBERSHIP_TIERS.map((tier) => ({
      code: tier.code,
      href: `${join}?plan=${tier.code}`,
      kind: "join" as const,
      annualPriceHkd: tier.annualPriceHkd,
    })),
  ];
}
