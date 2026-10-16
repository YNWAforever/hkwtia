import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';

import {Arrow} from '@/components/wt/arrow';
import {StatusLabel} from '@/components/wt/status-label';
import {formatEventDate} from '@/lib/home/format-event-date';
import {loadImpactMetrics} from '@/lib/home/impact-metrics';

// app/styles/wisetech.css:235 .impact-section; :236 .impact-grid; :240 .impact-metrics;
// :245-246 .impact-metrics .method-card.
// `embedded` (the homepage since the 2026-10-06 consolidation): a strip inside the archive
// section. The figures and the photographs are the same claim -- this is a platform with a
// record -- so they are one chapter, with the figures as its evidence line. h3, not h2.
export async function ImpactEvidence({locale, copyOverrides, embedded = false}: HomeCopyProps & {embedded?: boolean}) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.impact'});
  const metrics = await loadImpactMetrics();
  const formatDate = (value: Date) => formatEventDate(value, locale);

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

  const Title = embedded ? 'h3' : 'h2';
  const metricsGrid = (
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
  );
  const body = (
    <>
      <div>
        <p className={embedded ? 'eyebrow' : 'eyebrow light'}>{t('eyebrow')}</p>
        <Title id="impact-title">{t('title')}</Title>
        <p>{t('intro')}</p>
        <a className={embedded ? 'text-link' : 'text-link light-link'} href="https://hkwtia.org/" target="_blank" rel="noreferrer">{t('sourceLink')} <Arrow /></a>
      </div>
      {metricsGrid}
    </>
  );

  if (embedded) {
    return <div className="evidence-strip" role="group" aria-labelledby="impact-title">{body}</div>;
  }

  return (
    <section className="impact-section" aria-labelledby="impact-title">
      <div className="shell impact-grid">{body}</div>
    </section>
  );
}
