import {ActionLink} from "@/components/wt/action-link";
import {CardIndex} from "@/components/wt/card-index";

export type PlanGridTier = Readonly<{
  code: string;
  name: string;
  description: string;
  priceLines: readonly string[];
  seatLabel?: string;
  benefits: readonly string[];
  action: string;
  href: string;
}>;

export type PlanGridSme = Readonly<{label: string; title: string; copy: string; action: string; href: string}>;

export function PlanGrid({tiers, sme}: Readonly<{tiers: readonly PlanGridTier[]; sme: PlanGridSme}>) {
  return <><div className="plan-grid">
    {tiers.map((tier, index) => (
      <article id={tier.code} key={tier.code}>
        <CardIndex index={index + 1} />
        <h2>{tier.name}</h2>
        {tier.priceLines.map((line) => <p key={line}>{line}</p>)}
        <p>{tier.description}</p>
        {tier.seatLabel ? <p>{tier.seatLabel}</p> : null}
        <ul>{tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        <ActionLink href={tier.href} variant="text-link">{tier.action}</ActionLink>
      </article>
    ))}
  </div>
    <aside className="membership-plan-assistant">
      <p>{sme.label}</p>
      <h2>{sme.title}</h2>
      <p>{sme.copy}</p>
      <ActionLink href={sme.href} variant="text-link">{sme.action}</ActionLink>
    </aside>
  </>;
}
