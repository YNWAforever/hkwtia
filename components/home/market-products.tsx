import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {showcaseRepository} from '@/lib/db/repos/showcase';
import {cn} from '@/lib/utils';

const panels = [
  {key: 'directory', index: '01', href: '/showcase'},
  {key: 'marketplace', index: '02', href: '/showcase'},
] as const;

// Section 5 of 13. app/styles/wisetech.css:198 .product-split; :199 .product-panel;
// :202 .product-panel-head.
export async function MarketProducts({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.marketProducts'});
  const listings = await showcaseRepository.listPublished({}, {limit: 12}).catch(() => []);
  const available = listings.length > 0;

  return (
    <Section labelledBy="market-products-title" id="market-products">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="market-products-title" variant="stacked" />
      <div className="product-split">
        {panels.map((panel) => (
          <article className={cn('product-panel', `${panel.key}-panel`)} key={panel.key}>
            <div className="product-panel-head">
              <span>{panel.index}</span>
              <StatusLabel>{t(`${panel.key}.label`)}</StatusLabel>
            </div>
            <h3>{t(`${panel.key}.title`)}</h3>
            <p>{t(available ? `${panel.key}.copyAvailable` : `${panel.key}.copyEmpty`)}</p>
            <ActionLink variant="text-link" href={panel.href}>{t(`${panel.key}.action`)}</ActionLink>
          </article>
        ))}
      </div>
    </Section>
  );
}
