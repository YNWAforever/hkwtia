import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {CohortCalendar} from '@/components/marketing/cohort-calendar';
import {CohortApplicationForm} from '@/components/marketing/cohort-application-form';
import {FundingResults, FundingWizard} from '@/components/marketing/funding-wizard';
import {LandingPartnerMap} from '@/components/marketing/landing-partner-map';
import {LaunchpadGbaOpening} from '@/components/marketing/launchpad-gba-opening';
import {ClosingBand} from '@/components/wt/closing-band';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';
import {landingPartnersRepository} from '@/lib/db/repos/landing-partners';
import {getFundingResults, parseFundingAnswers} from '@/lib/launchpad/funding';
import {applyToCohortAction} from '@/lib/launchpad/member-actions';
import type {Actor} from '@/lib/membership/lifecycle';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export const dynamic = "force-dynamic";
const anonymous: Actor = {kind: "anonymous", userId: null};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'LaunchPad'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/launchpad', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function LaunchPadPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  const appLocale = locale as AppLocale;
  setRequestLocale(appLocale);
  // CLAUDE.md: public pages degrade rather than 500. The WP-0 visual baseline caught
  // /launchpad returning 500 with an empty DATABASE_URL because this call, unlike the
  // landing-partners read below, had no fallback.
  const [t, common, cohorts] = await Promise.all([
    getTranslations({locale: appLocale, namespace: 'LaunchPad'}),
    getTranslations({locale: appLocale, namespace: 'Common'}),
    cohortRepository.listPublicCohorts(anonymous).catch((): Awaited<ReturnType<typeof cohortRepository.listPublicCohorts>> => []),
  ]);
  const partners = await landingPartnersRepository.listPublished({limit: 100}).catch(() => []);
  const answers = parseFundingAnswers(query);
  const fundingResults = getFundingResults(query, appLocale);
  const calendarLabels = {title: t('calendar.title'), empty: t('calendar.empty'), starts: t('calendar.starts'), ends: t('calendar.ends'), noEnd: t('calendar.noEnd'), capacity: t('calendar.capacity'), fee: t('calendar.fee'), statuses: {planning: t('calendar.statuses.planning'), open: t('calendar.statuses.open'), active: t('calendar.statuses.active'), completed: t('calendar.statuses.completed'), archived: t('calendar.statuses.archived')}};
  const partnerLabels = {title: t('partners.title'), empty: t('partners.empty'), market: t('partners.market'), region: t('partners.region')};
  const fundingLabels = {formLabel: t('funding.formLabel'), instructions: t('funding.instructions'), submit: t('funding.submit'), questions: {sector: {label: t('funding.questions.sector.label'), options: {trade: t('funding.questions.sector.options.trade'), 'advanced-training': t('funding.questions.sector.options.advancedTraining'), 'smart-production': t('funding.questions.sector.options.smartProduction'), 'life-health': t('funding.questions.sector.options.lifeHealth'), 'ai-data-science': t('funding.questions.sector.options.aiDataScience'), 'advanced-manufacturing-new-energy': t('funding.questions.sector.options.advancedManufacturing'), 'research-development': t('funding.questions.sector.options.researchDevelopment')}}, stage: {label: t('funding.questions.stage.label'), options: {'business-registered-non-subvented': t('funding.questions.stage.options.businessRegistered'), 'incorporated-non-subvented': t('funding.questions.stage.options.incorporated'), 'incorporated-subvented': t('funding.questions.stage.options.subvented')}}, market: {label: t('funding.questions.market.label'), options: {'hong-kong': t('funding.questions.market.options.hongKong'), 'covered-economy': t('funding.questions.market.options.coveredEconomy'), global: t('funding.questions.market.options.global')}}, employees: {label: t('funding.questions.employees.label'), options: {standard: t('funding.questions.employees.options.standard'), 'trainee-hk-pr': t('funding.questions.employees.options.traineeHongKongPermanentResident')}}, revenue: {label: t('funding.questions.revenue.label'), options: {'under-100m': t('funding.questions.revenue.options.under100m'), 'investment-100m-project-150m': t('funding.questions.revenue.options.investment100mProject150m'), 'eligible-rd-expenditure': t('funding.questions.revenue.options.eligibleRdExpenditure')}}}};
  const fundingResultsLabels = {heading: t('funding.results.heading'), eligible: t('funding.results.eligible'), ineligible: t('funding.results.ineligible'), source: t('funding.results.source'), asOf: t('funding.results.asOf')};
  const openCohorts = cohorts.filter((cohort) => cohort.status === 'open').map((cohort) => ({id: cohort.id, name: appLocale === 'zh-HK' ? cohort.nameZhHk : cohort.nameEn, status: cohort.status}));
  const applicationLabels = {title: t('application.title'), cohort: t('application.cohort'), market: t('application.market'), readiness: t('application.readiness'), consent: t('application.consent'), submit: t('application.submit'), submitting: t('application.submitting'), success: t('application.success'), invalid: t('application.invalid'), unauthorized: t('application.unauthorized'), signIn: t('application.signIn'), error: t('application.error')};
  const openingLabels = {
    eyebrow: t('eyebrow'), title: t('title'), lead: t('description'),
    breadcrumbHome: common('breadcrumbHome'), breadcrumbLabel: common('breadcrumbLabel'), breadcrumbCurrent: t('breadcrumbCurrent'),
    opening: {eyebrow: t('gbaOpening.eyebrow'), title: t('gbaOpening.title'), copy: t('gbaOpening.copy'), map: {hk: t('gbaOpening.map.hk'), gz: t('gbaOpening.map.gz'), sz: t('gbaOpening.map.sz')}},
    services: [
      {title: t('services.marketEntry.title'), copy: t('services.marketEntry.copy')},
      {title: t('services.softLanding.title'), copy: t('services.softLanding.copy')},
      {title: t('services.buyerMatching.title'), copy: t('services.buyerMatching.copy')},
      {title: t('services.delegations.title'), copy: t('services.delegations.copy')},
    ],
  };

  return (
    <>
      <LaunchpadGbaOpening labels={openingLabels} />
      <Section tone="paper">
        <SectionHeading eyebrow={t('program.title')} title={t('program.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('program.intro')}</p>
        <div className="mt-6 space-y-4">
          <p className="text-lg font-medium">{t('program.outcomeTitle')}</p>
          <p className="text-muted-foreground">{t('program.outcomeDescription')}</p>
        </div>
      </Section>
      <Section tone="bright">
        <SectionHeading eyebrow={t('calendar.title')} title={t('calendar.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('calendar.intro')}</p>
        <div className="mt-6"><CohortCalendar cohorts={cohorts} locale={appLocale} labels={calendarLabels}/></div>
      </Section>
      <Section tone="paper">
        <SectionHeading eyebrow={t('partners.title')} title={t('partners.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('partners.intro')}</p>
        <div className="mt-6"><LandingPartnerMap partners={partners} locale={appLocale} labels={partnerLabels}/></div>
      </Section>
      <Section tone="bright">
        <SectionHeading eyebrow={t('funding.title')} title={t('funding.title')} variant="stacked" />
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('funding.intro')}</p>
        <div className="mt-6 space-y-10"><FundingWizard locale={appLocale} answers={answers} labels={fundingLabels}/><FundingResults results={fundingResults} labels={fundingResultsLabels}/></div>
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
    </>
  );
}
