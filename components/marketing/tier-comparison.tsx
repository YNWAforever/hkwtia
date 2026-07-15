import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type MembershipTier = {id: string; name: string; price: string; cadence: string; description: string; benefits: readonly string[]; action: string};

export function TierComparison({locale, tiers}: {locale: AppLocale; tiers: readonly MembershipTier[]}) {
  return <div className="grid gap-6 md:grid-cols-2">{tiers.map((tier) => <article className="glass-card flex flex-col p-6" key={tier.id}><h3 className="text-2xl font-semibold">{tier.name}</h3><p className="mt-3 text-3xl font-bold text-primary">{tier.price}</p><p className="text-sm text-muted-foreground">{tier.cadence}</p><p className="mt-4 text-muted-foreground">{tier.description}</p><ul className="mt-5 flex-1 space-y-2">{tier.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}</ul><Link className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href={`${localizedPath(locale, "/join")}?plan=${tier.id}`}>{tier.action}</Link></article>)}</div>;
}
