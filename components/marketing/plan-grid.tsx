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

export function PlanGrid({tiers, sme, labels}: Readonly<{tiers: readonly PlanGridTier[]; sme: PlanGridSme; labels?: Readonly<{audience: string; fee: string; uses: string; next: string}>}>) {
  return <><div className="plan-grid">
    {tiers.map((tier, index) => (
      <article id={tier.code} key={tier.code}>
        <CardIndex index={index + 1} />
        <h2>{tier.name}</h2>
        {labels ? <p className="plan-field-label">{labels.audience}</p> : null}
        <p>{tier.description}</p>
        {labels ? <p className="plan-field-label">{labels.fee}</p> : null}
        {tier.priceLines.map((line) => <p key={line}>{line}</p>)}
        {tier.seatLabel ? <p>{tier.seatLabel}</p> : null}
        {labels ? <p className="plan-field-label">{labels.uses}</p> : null}
        <ul>{tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        {labels ? <p className="sr-only">{labels.next}</p> : null}
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
