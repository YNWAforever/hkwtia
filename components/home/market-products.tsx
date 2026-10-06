import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import {companyProfilesRepository} from '@/lib/db/repos/company-profiles';
import {showcaseRepository} from '@/lib/db/repos/showcase';
import {parseMemberFilters} from '@/lib/members/public';
import {cn} from '@/lib/utils';

const panels = [
  {key: 'directory', index: '01', href: '/members'},
  {key: 'marketplace', index: '02', href: '/showcase'},
] as const;

// app/styles/wisetech.css:198 .product-split; :199 .product-panel; :202 .product-panel-head.
// `embedded` (the homepage since the 2026-10-06 consolidation): rendered inside the Ecosystem
// section as its "entry points" -- the directory and the marketplace are where an industry
// pathway leads, so they read as the end of that chapter, not as a separate one. Headings step
// down a level (h3 lead, h4 panels) to stay nested under the Ecosystem h2.
export async function MarketProducts({locale, copyOverrides, embedded = false}: HomeCopyProps & {embedded?: boolean}) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.marketProducts'});
  const [members, listings] = await Promise.all([
    companyProfilesRepository.listPublishedPage(parseMemberFilters({}), null, 1).catch(() => null),
    showcaseRepository.listPublished({}, {limit: 12}).catch(() => null),
  ]);
  const availability = {
    directory: members === null ? "unavailable" : members.items.length > 0 ? "available" : "empty",
    marketplace: listings === null ? "unavailable" : listings.length > 0 ? "available" : "empty",
  } as const;

  const PanelHeading = embedded ? 'h4' : 'h3';
  const split = (
    <div className="product-split">
      {panels.map((panel) => (
        <article className={cn('product-panel', `${panel.key}-panel`)} key={panel.key}>
          <div className="product-panel-head">
            <span>{panel.index}</span>
            <StatusLabel>{t(`${panel.key}.label`)}</StatusLabel>
          </div>
          <PanelHeading>{t(`${panel.key}.title`)}</PanelHeading>
          <p>{t(`${panel.key}.${availability[panel.key] === "unavailable" ? "copyUnavailable" : availability[panel.key] === "available" ? "copyAvailable" : "copyEmpty"}`)}</p>
          <ActionLink variant="text-link" href={panel.href}>{t(`${panel.key}.action`)}</ActionLink>
        </article>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="ecosystem-entry" id="market-products" role="group" aria-labelledby="market-products-title">
        <div className="ecosystem-entry-head">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h3 id="market-products-title">{t('title')}</h3>
        </div>
        {split}
      </div>
    );
  }

  return (
    <Section labelledBy="market-products-title" id="market-products">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="market-products-title" variant="stacked" />
      {split}
    </Section>
  );
}
