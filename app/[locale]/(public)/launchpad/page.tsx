import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {CohortCalendar} from '@/components/marketing/cohort-calendar';
import {FundingResults, FundingWizard} from '@/components/marketing/funding-wizard';
import {LandingPartnerMap} from '@/components/marketing/landing-partner-map';
import {PageHero} from '@/components/marketing/page-hero';
import {Section} from '@/components/marketing/section';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';
import {getFundingResults, parseFundingAnswers} from '@/lib/launchpad/funding';
import {buildPageMetadata} from '@/lib/metadata';
import {localizedPath} from '@/lib/urls';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'LaunchPad'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/launchpad', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function LaunchPadPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  const appLocale = locale as AppLocale;
  setRequestLocale(appLocale);
  const [t, cohorts, partners] = await Promise.all([
    getTranslations({locale: appLocale, namespace: 'LaunchPad'}),
    cohortRepository.listPublicCohorts(),
    cohortRepository.listPublicPartners(),
  ]);
  const answers = parseFundingAnswers(query);
  const fundingResults = getFundingResults(query, appLocale);
  const calendarLabels = {title: t('calendar.title'), empty: t('calendar.empty'), starts: t('calendar.starts'), ends: t('calendar.ends'), noEnd: t('calendar.noEnd'), capacity: t('calendar.capacity'), fee: t('calendar.fee'), statuses: {planning: t('calendar.statuses.planning'), open: t('calendar.statuses.open'), active: t('calendar.statuses.active'), completed: t('calendar.statuses.completed'), archived: t('calendar.statuses.archived')}};
  const partnerLabels = {title: t('partners.title'), empty: t('partners.empty'), market: t('partners.market'), region: t('partners.region'), statuses: {prospect: t('partners.statuses.prospect'), in_discussion: t('partners.statuses.inDiscussion'), signed: t('partners.statuses.signed'), inactive: t('partners.statuses.inactive')}};
  const fundingLabels = {formLabel: t('funding.formLabel'), instructions: t('funding.instructions'), submit: t('funding.submit'), questions: {sector: {label: t('funding.questions.sector.label'), options: {trade: t('funding.questions.sector.options.trade'), 'advanced-training': t('funding.questions.sector.options.advancedTraining'), 'smart-production': t('funding.questions.sector.options.smartProduction'), 'life-health': t('funding.questions.sector.options.lifeHealth'), 'ai-data-science': t('funding.questions.sector.options.aiDataScience'), 'advanced-manufacturing-new-energy': t('funding.questions.sector.options.advancedManufacturing'), 'research-development': t('funding.questions.sector.options.researchDevelopment')}}, stage: {label: t('funding.questions.stage.label'), options: {'business-registered-non-subvented': t('funding.questions.stage.options.businessRegistered'), 'incorporated-non-subvented': t('funding.questions.stage.options.incorporated'), 'incorporated-subvented': t('funding.questions.stage.options.subvented')}}, market: {label: t('funding.questions.market.label'), options: {'hong-kong': t('funding.questions.market.options.hongKong'), 'covered-economy': t('funding.questions.market.options.coveredEconomy'), global: t('funding.questions.market.options.global')}}, employees: {label: t('funding.questions.employees.label'), options: {standard: t('funding.questions.employees.options.standard'), 'trainee-hk-pr': t('funding.questions.employees.options.traineeHongKongPermanentResident')}}, revenue: {label: t('funding.questions.revenue.label'), options: {'under-100m': t('funding.questions.revenue.options.under100m'), 'investment-100m-project-150m': t('funding.questions.revenue.options.investment100mProject150m'), 'eligible-rd-expenditure': t('funding.questions.revenue.options.eligibleRdExpenditure')}}}};
  const fundingResultsLabels = {heading: t('funding.results.heading'), eligible: t('funding.results.eligible'), ineligible: t('funding.results.ineligible'), source: t('funding.results.source'), asOf: t('funding.results.asOf')};

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <Section heading={t('program.title')} intro={t('program.intro')}><div className="glass-card space-y-4 p-6"><p className="text-lg font-medium">{t('program.outcomeTitle')}</p><p className="text-muted-foreground">{t('program.outcomeDescription')}</p></div></Section>
      <Section heading={t('calendar.title')} intro={t('calendar.intro')}><CohortCalendar cohorts={cohorts} locale={appLocale} labels={calendarLabels}/></Section>
      <Section heading={t('partners.title')} intro={t('partners.intro')}><LandingPartnerMap partners={partners} locale={appLocale} labels={partnerLabels}/></Section>
      <Section heading={t('funding.title')} intro={t('funding.intro')}><div className="space-y-10"><FundingWizard locale={appLocale} answers={answers} labels={fundingLabels}/><FundingResults results={fundingResults} labels={fundingResultsLabels}/></div></Section>
      <section className="container mx-auto px-6 pb-16 sm:pb-24"><div className="glass-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold">{t('clinic.title')}</h2><p className="mt-2 text-muted-foreground">{t('clinic.description')}</p></div><a className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground" href={localizedPath(appLocale, '/contact')}>{t('clinicCta')}</a></div></section>
    </>
  );
}
