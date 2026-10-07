import {InnerCardGrid, type InnerCardGridItem} from '@/components/wt/inner-card-grid';

type BenefitCardsProps = Readonly<{title: string; items: readonly InnerCardGridItem[]; actionLabel: string}>;

export function BenefitCards({title, items, actionLabel}: BenefitCardsProps) {
  return (
    <section className="portal-benefits" aria-labelledby="portal-benefits-title">
      <h2 id="portal-benefits-title">{title}</h2>
      <InnerCardGrid items={items} actionLabel={actionLabel} />
    </section>
  );
}
