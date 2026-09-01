import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {PublicMembershipTier} from "@/lib/membership/public-catalog";
import {localizedPath} from "@/lib/urls";

export type MembershipTier = PublicMembershipTier & Readonly<{
  name: string;
  description: string;
  benefits: readonly string[];
  action: string;
  labels: Readonly<{free: string; review: string; annual: string; monthly: string}>;
}>;

function TierPrice({tier}: {tier: MembershipTier}) {
  if (tier.price.kind === "free" || tier.price.kind === "review") {
    const label = tier.price.kind === "free" ? tier.labels.free : tier.labels.review;
    return <p className="mt-3 text-3xl font-bold text-primary">{label}</p>;
  }

  return <div className="mt-3 space-y-3">
    {tier.price.options.map((option) => <div key={option.cadence}>
      <p className="text-3xl font-bold text-primary">{option.amount}</p>
      <p className="text-sm text-muted-foreground">{tier.labels[option.cadence]}</p>
    </div>)}
  </div>;
}

export function TierComparison({locale, tiers}: {locale: AppLocale; tiers: readonly MembershipTier[]}) {
  return <div className="grid gap-6 md:grid-cols-2">
    {tiers.map((tier) => <article className="glass-card flex flex-col p-6" key={tier.code}>
      <h3 className="text-2xl font-semibold">{tier.name}</h3>
      <TierPrice tier={tier} />
      <p className="mt-4 text-muted-foreground">{tier.description}</p>
      <ul className="mt-5 flex-1 space-y-2">
        {tier.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}
      </ul>
      <Link
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={localizedPath(locale, tier.cta.href)}
      >
        {tier.action}
      </Link>
    </article>)}
  </div>;
}
