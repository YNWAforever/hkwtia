export type MembershipTier = {id: string; name: string; price: string; cadence: string; description: string; benefits: readonly string[]; action: string};

export function TierComparison({tiers}: {tiers: readonly MembershipTier[]}) {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{tiers.map((tier) => <article className="glass-card flex flex-col p-6" key={tier.id}><h3 className="text-2xl font-semibold">{tier.name}</h3><p className="mt-3 text-3xl font-bold text-primary">{tier.price}</p><p className="text-sm text-muted-foreground">{tier.cadence}</p><p className="mt-4 text-muted-foreground">{tier.description}</p><ul className="mt-5 flex-1 space-y-2">{tier.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}</ul><p className="mt-6 rounded-md bg-muted p-3 text-sm font-medium">{tier.action}</p></article>)}</div>;
}
