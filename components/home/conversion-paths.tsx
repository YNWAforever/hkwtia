import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {membershipPlansRepository} from '@/lib/db/repos/membership-plans';
import {buildPublicMembershipCatalog, publicPriceIds} from '@/lib/membership/public-catalog';

// D-7: the donor's /partner-with-us and /partners are not ported PublicRoute members yet,
// so partnership points at hkwtia's real /contact and /about destinations instead.
const panels = [
  {key: 'membership', primaryHref: '/membership', secondaryHref: '/join'},
  {key: 'partnership', primaryHref: '/contact', secondaryHref: '/about'},
] as const;

// Section 13 of 13 -- the last homepage section. app/styles/wisetech.css:774 .conversion-section
// (gradient background); :775 .conversion-grid (bordered 2-column panel layout).
export async function ConversionPaths({locale}: Readonly<{locale: AppLocale}>) {
  const [t, tMembership, rows] = await Promise.all([
    getTranslations({locale, namespace: 'Home.conversionPaths'}),
    getTranslations({locale, namespace: 'Membership'}),
    membershipPlansRepository.list().catch(() => null),
  ]);
  const catalog = rows === null ? [] : buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()});
  const prices = catalog.flatMap((tier) => tier.price.kind === 'paid'
    ? tier.price.options.map((option) => ({
        key: `${tier.code}-${option.cadence}`,
        label: `${tMembership(`tiers.${tier.code}.name`)} · ${option.amount} ${tMembership(`cadenceLabels.${option.cadence}`)}`,
      }))
    : []);

  return (
    <Section labelledBy="conversion-paths-title" id="conversion-paths" className="conversion-section">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="conversion-paths-title" variant="split" lead={t('intro')} />
      <div className="conversion-grid">
        {panels.map((panel) => {
          const points = t.raw(`${panel.key}.points`) as readonly string[];
          return (
            <article key={panel.key}>
              <StatusLabel>{t(`${panel.key}.label`)}</StatusLabel>
              <h3>{t(`${panel.key}.title`)}</h3>
              <p>{t(`${panel.key}.copy`)}</p>
              {panel.key === "membership" && prices.length > 0 ? <div aria-label={t("membership.catalogPricesLabel")} className="mt-3 space-y-1">
                {prices.map((price) => <p key={price.key}>{price.label}</p>)}
              </div> : null}
              <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
              <div>
                <ActionLink href={panel.primaryHref} variant="button-dark">{t(`${panel.key}.primaryAction`)}</ActionLink>
                <ActionLink href={panel.secondaryHref} variant="text-link">{t(`${panel.key}.secondaryAction`)}</ActionLink>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
