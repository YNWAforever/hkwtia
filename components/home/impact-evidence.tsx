import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {loadImpactMetrics} from '@/lib/home/impact-metrics';

// Section 10 of 13. app/styles/wisetech.css:235 .impact-section; :236 .impact-grid;
// :240 .impact-metrics; :245-246 .impact-metrics .method-card.
export async function ImpactEvidence({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.impact'});
  const metrics = await loadImpactMetrics();
  const formatDate = (value: Date) => new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(value);

  const tiles = [
    metrics.pastEvents ? {
      value: metrics.pastEvents.value,
      label: t('pastEvents.label'),
      definition: t('pastEvents.definition'),
      period: t('pastEvents.period', {date: formatDate(metrics.pastEvents.asOf)}),
    } : null,
    metrics.publishedPartners ? {
      value: metrics.publishedPartners.value,
      label: t('publishedPartners.label'),
      definition: t('publishedPartners.definition'),
      period: t('publishedPartners.period', {date: formatDate(metrics.publishedPartners.asOf)}),
    } : null,
    metrics.asaRegions ? {
      value: metrics.asaRegions.value,
      label: t('asaRegions.label'),
      definition: t('asaRegions.definition'),
      period: t('asaRegions.period', {year: metrics.asaRegions.year}),
    } : null,
  ].filter((tile): tile is NonNullable<typeof tile> => tile !== null);

  if (tiles.length === 0) return null;

  return (
    <section className="impact-section" aria-labelledby="impact-title">
      <div className="shell impact-grid">
        <div>
          <p className="eyebrow light">{t('eyebrow')}</p>
          <h2 id="impact-title">{t('title')}</h2>
          <p>{t('intro')}</p>
          <a className="text-link light-link" href="https://hkwtia.org/" target="_blank" rel="noreferrer">{t('sourceLink')} <Arrow /></a>
        </div>
        <div className="impact-metrics">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <strong>{tile.value}</strong>
              <span>{tile.label}</span>
              {/* Definition and period stay in separate elements (not one interpolated string) so
                  each is independently queryable, matching tests/unit/home-impact-evidence.test.tsx's
                  exact-text assertion on the definition alone. */}
              <small><span>{tile.definition}</span> · <span>{tile.period}</span></small>
            </div>
          ))}
          <div className="method-card">
            <StatusLabel>{t('sourceLabel')}</StatusLabel>
            <p>{t('source')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
