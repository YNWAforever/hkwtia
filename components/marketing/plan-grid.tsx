import {ActionLink} from "@/components/wt/action-link";
import {CardIndex} from "@/components/wt/card-index";

export type PlanGridTier = Readonly<{
  code: string;
  name: string;
  description: string;
  priceLines: readonly string[];
  benefits: readonly string[];
  action: string;
  href: string;
}>;

export type PlanGridSme = Readonly<{label: string; title: string; copy: string; action: string; href: string}>;

// `.plan-grid article:nth-child(5)` auto-styles the fifth card dark -- the SME card is simply
// rendered fifth, in DOM order, so it needs no class of its own to be visually distinct (D-7).
export function PlanGrid({tiers, sme}: Readonly<{tiers: readonly PlanGridTier[]; sme: PlanGridSme}>) {
  return <div className="plan-grid">
    {tiers.map((tier, index) => (
      <article id={tier.code} key={tier.code}>
        <CardIndex index={index + 1} />
        <h2>{tier.name}</h2>
        {tier.priceLines.map((line) => <p key={line}>{line}</p>)}
        <p>{tier.description}</p>
        <ul>{tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        <ActionLink href={tier.href} variant="text-link">{tier.action}</ActionLink>
      </article>
    ))}
    <article>
      <CardIndex index={tiers.length + 1} />
      <h2>{sme.title}</h2>
      <p>{sme.copy}</p>
      <ActionLink href={sme.href} variant="text-link">{sme.action}</ActionLink>
    </article>
  </div>;
}
