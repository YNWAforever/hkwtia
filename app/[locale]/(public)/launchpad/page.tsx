import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {CohortCalendar} from '@/components/marketing/cohort-calendar';
import {CohortApplicationForm} from '@/components/marketing/cohort-application-form';
import {LandingPartnerMap} from '@/components/marketing/landing-partner-map';
import {LaunchpadGbaOpening} from '@/components/marketing/launchpad-gba-opening';
import {StructuredData} from '@/components/seo/structured-data';
import {ClosingBand} from '@/components/wt/closing-band';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';
import {landingPartnersRepository} from '@/lib/db/repos/landing-partners';
import {applyToCohortAction} from '@/lib/launchpad/member-actions';
import type {Actor} from '@/lib/membership/lifecycle';
import {buildPageMetadata} from '@/lib/metadata';
import {routeBreadcrumbItems} from '@/lib/seo/route-breadcrumbs';
import {buildBreadcrumbData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export const dynamic = "force-dynamic";
const anonymous: Actor = {kind: "anonymous", userId: null};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'LaunchPad'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/launchpad', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function LaunchPadPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}] = await Promise.all([params, searchParams]);
  const appLocale = locale as AppLocale;
  setRequestLocale(appLocale);
  // CLAUDE.md: public pages degrade rather than 500. The WP-0 visual baseline caught
  // /launchpad returning 500 with an empty DATABASE_URL because this call, unlike the
  // landing-partners read below, had no fallback.
  const [t, common, tRoot, cohorts] = await Promise.all([
    getTranslations({locale: appLocale, namespace: 'LaunchPad'}),
    getTranslations({locale: appLocale, namespace: 'Common'}),
    // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.launchpad`).
    getTranslations({locale: appLocale}),
    cohortRepository.listPublicCohorts(anonymous).catch(() => null),
  ]);
  const partners = await landingPartnersRepository.listPublished({limit: 100}).catch(() => null);
  const availableCohorts = cohorts ?? [];
  const calendarLabels = {title: t('calendar.title'), empty: t(cohorts === null ? 'calendar.unavailable' : 'calendar.empty'), starts: t('calendar.starts'), ends: t('calendar.ends'), noEnd: t('calendar.noEnd'), capacity: t('calendar.capacity'), fee: t('calendar.fee'), statuses: {planning: t('calendar.statuses.planning'), open: t('calendar.statuses.open'), active: t('calendar.statuses.active'), completed: t('calendar.statuses.completed'), archived: t('calendar.statuses.archived')}};
  const partnerLabels = {title: t('partners.title'), empty: t(partners === null ? 'partners.unavailable' : 'partners.empty'), market: t('partners.market'), region: t('partners.region')};
  const openCohorts = availableCohorts.filter((cohort) => cohort.status === 'open').map((cohort) => ({id: cohort.id, name: appLocale === 'zh-HK' ? cohort.nameZhHk : cohort.nameEn, status: cohort.status}));
  const applicationLabels = {title: t('application.title'), cohort: t('application.cohort'), market: t('application.market'), readiness: t('application.readiness'), consent: t('application.consent'), submit: t('application.submit'), submitting: t('application.submitting'), success: t('application.success'), invalid: t('application.invalid'), unauthorized: t('application.unauthorized'), signIn: t('application.signIn'), error: t('application.error')};
  const openingLabels = {
    eyebrow: t('eyebrow'), title: t('title'), lead: t('description'),
    breadcrumbHome: common('breadcrumbHome'), breadcrumbLabel: common('breadcrumbLabel'), breadcrumbCurrent: t('breadcrumbCurrent'),
    opening: {eyebrow: t('gbaOpening.eyebrow'), title: t('gbaOpening.title'), copy: t('gbaOpening.copy')},
  };

  return (
    <>
      <LaunchpadGbaOpening labels={openingLabels} />
      {/* The site's split heading (title left, intro right), as on every other section. These
          four stacked the intro under the title in a 672px column and left the rest of a
          1440px screen empty; the programme outcome was a bare paragraph standing in for a
          subheading. */}
      <Section tone="paper">
        <SectionHeading eyebrow={t('program.eyebrow')} title={t('program.title')} variant="split" lead={t('program.intro')} />
        <div className="launchpad-outcome">
          <h3>{t('program.outcomeTitle')}</h3>
          <p>{t('program.outcomeDescription')}</p>
        </div>
      </Section>
      <Section tone="bright">
        <SectionHeading eyebrow={t('calendar.eyebrow')} title={t('calendar.title')} variant="split" lead={t('calendar.intro')} />
        <div className="mt-6"><CohortCalendar cohorts={availableCohorts} locale={appLocale} labels={calendarLabels}/></div>
      </Section>
      <Section tone="paper">
        <SectionHeading eyebrow={t('partners.eyebrow')} title={t('partners.title')} variant="split" lead={t('partners.intro')} />
        <div className="mt-6"><LandingPartnerMap partners={partners ?? []} locale={appLocale} labels={partnerLabels}/></div>
      </Section>
      {openCohorts.length > 0 ? (
        <Section tone="paper">
          <CohortApplicationForm action={applyToCohortAction} cohorts={openCohorts} labels={applicationLabels} locale={appLocale}/>
        </Section>
      ) : null}
      <ClosingBand
        eyebrow={t('clinic.label')}
        title={t('clinic.title')}
        copy={t('clinic.description')}
        actions={[{href: '/contact', label: t('clinicCta')}]}
      />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(appLocale, '/launchpad', tRoot))} />
    </>
  );
}
