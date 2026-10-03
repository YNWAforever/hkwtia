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

// Section 5 of 13. app/styles/wisetech.css:198 .product-split; :199 .product-panel;
// :202 .product-panel-head.
export async function MarketProducts({locale, copyOverrides}: HomeCopyProps) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.marketProducts'});
  const [members, listings] = await Promise.all([
    companyProfilesRepository.listPublishedPage(parseMemberFilters({}), null, 1).catch(() => null),
    showcaseRepository.listPublished({}, {limit: 12}).catch(() => null),
  ]);
  const availability = {
    directory: members === null ? "unavailable" : members.items.length > 0 ? "available" : "empty",
    marketplace: listings === null ? "unavailable" : listings.length > 0 ? "available" : "empty",
  } as const;

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
            <p>{t(`${panel.key}.${availability[panel.key] === "unavailable" ? "copyUnavailable" : availability[panel.key] === "available" ? "copyAvailable" : "copyEmpty"}`)}</p>
            <ActionLink variant="text-link" href={panel.href}>{t(`${panel.key}.action`)}</ActionLink>
          </article>
        ))}
      </div>
    </Section>
  );
}
