import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgrammeGrid, type ProgrammeGridLabels} from '@/components/marketing/programme-grid';
import {ActionLink} from '@/components/wt/action-link';
import {Arrow} from '@/components/wt/arrow';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Programmes'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programmes', title: t('metaTitle'), description: t('metaDescription')});
}

// The typed index the manifest retired for want of one (route-design-programmes, WP-7): four
// records from content/programs/index.ts, the cohort-backed Launch Pad, and the archive's edition
// spans. Nothing here is a count or a date typed by hand -- summarizeProgrammes() reads them.
export default async function ProgrammesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, home] = await Promise.all([
    getTranslations({locale, namespace: 'Programmes'}),
    getTranslations({locale, namespace: 'Common'}),
    getTranslations({locale, namespace: 'Home.programmeShowcase'}),
  ]);
  const summaries = summarizeProgrammes();
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(t('open.mailSubject'))}`;
  const groupings = [
    {id: 'catalogue', label: t('groupings.catalogue')},
    {id: 'launchpad', label: t('groupings.launchpad')},
    {id: 'history', label: t('groupings.history')},
  ] as const;
  // The card copy is the home showcase's (Home.programmeShowcase) so the two grids never drift;
  // the history list below reuses the same names rather than a second set of keys.
  const labels: ProgrammeGridLabels = {
    eventSeriesLabel: home('eventSeriesLabel'),
    credentialLabel: home('credentialLabel'),
    credentialFact: home('credentialFact'),
    editionsFact: (count, year) => home('editionsFact', {count, year}),
    action: home('action'),
    items: {
      cpai: {name: home('items.cpai.name'), description: home('items.cpai.description')},
      hkict: {name: home('items.hkict.name'), description: home('items.hkict.description')},
      tct: {name: home('items.tct.name'), description: home('items.tct.description')},
      asa: {name: home('items.asa.name'), description: home('items.asa.description')},
    },
  };

  return (
    <>
      <PageHero
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('hero.breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section id="open" labelledBy="programmes-open-title">
        <SectionHeading variant="inner" eyebrow={t('open.eyebrow')} title={t('open.title')} headingId="programmes-open-title" lead={t('open.intro')} />
        {/* Same-page anchors: a bare <a> like the layout's skip link, since a hash needs no
            locale prefix and `.programme-groupings a` styles the bare child anchor. */}
        <nav className="programme-groupings" aria-label={t('groupings.label')}>
          {groupings.map((grouping, index) => (
            <a href={`#${grouping.id}`} key={grouping.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {grouping.label}
              <Arrow />
            </a>
          ))}
        </nav>
        <HonestEmpty variant="inner" label={t('open.statusLabel')} title={t('open.emptyTitle')} copy={t('open.emptyCopy')} actions={[{href: mailto, label: t('open.action')}]} />
      </Section>
      <Section id="catalogue" labelledBy="programmes-catalogue-title">
        <SectionHeading variant="split" eyebrow={t('catalogue.eyebrow')} title={t('catalogue.title')} headingId="programmes-catalogue-title" lead={t('catalogue.intro')} />
        <ProgrammeGrid summaries={summaries} labels={labels} />
      </Section>
      <Section id="launchpad" tone="bright" labelledBy="programmes-launchpad-title">
        <SectionHeading variant="inner" eyebrow={t('launchpad.eyebrow')} title={t('launchpad.title')} headingId="programmes-launchpad-title" lead={t('launchpad.copy')} />
        <div className="directory-actions">
          <ActionLink href="/launchpad" variant="button-dark">{t('launchpad.action')}</ActionLink>
        </div>
      </Section>
      <Section id="history" labelledBy="programmes-history-title">
        <SectionHeading variant="inner" eyebrow={t('history.eyebrow')} title={t('history.title')} headingId="programmes-history-title" lead={t('history.intro')} />
        <ul className="programme-groupings">
          {summaries.map((programme, index) => (
            <li key={programme.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{labels.items[programme.id].name}</b>
              {programme.type === 'credential' || programme.firstYear === null || programme.latestYear === null ? (
                <span>{t('history.credential')}</span>
              ) : (
                <span>
                  {t('history.span', {first: programme.firstYear, latest: programme.latestYear})} · {t('history.editions', {count: programme.editionCount ?? 0})}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="directory-actions">
          <ActionLink href="/events" variant="button-dark">{t('history.events')}</ActionLink>
          <ActionLink href="/contact" variant="text-link">{t('history.partner')}</ActionLink>
        </div>
      </Section>
    </>
  );
}
