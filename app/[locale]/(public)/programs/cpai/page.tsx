import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramCredential} from '@/components/marketing/program-credential';
import {localiseImages} from '@/components/marketing/program-editions';
import {StorySection} from '@/components/marketing/story-section';
import {StructuredData} from '@/components/seo/structured-data';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {cpai} from '@/content/programs/cpai';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {brandedTitle, buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';
import {routeBreadcrumbItems} from '@/lib/seo/route-breadcrumbs';
import {buildBreadcrumbData, buildEventSeriesData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'cpai')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/cpai', title: brandedTitle(locale as AppLocale, t('title')), description: t('description'), image: program.image});
}

export default async function CpaiPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
  // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
  const tRoot = await getTranslations({locale});
  const zh = locale === 'zh-HK';

  // CPAI is a credential: summarizeProgrammes() already marks it type: 'credential' with no
  // editionCount/latestYear, so buildProgrammeHeaderFacts renders the credential branch
  // without any cpai-specific conditional here.
  const summary = summarizeProgrammes().find((item) => item.id === 'cpai')!;
  const facts = buildProgrammeHeaderFacts(summary, tr, t('title'));
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(facts.mailSubject)}`;

  return (
    <>
      <PageHero
        className="rich-page-hero"
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      {/* Two cells, not a blank third column where the unverified audience sat. */}
      <RichCompass
        className="cpai-compass"
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto}
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramCredential
        completionHeading={tr('credentialPartnerCertificate')}
        completionTerms={zh ? cpai.partnerCertificateZh : cpai.partnerCertificateEn}
        courseName={zh ? cpai.courseNameZh : cpai.courseNameEn}
        images={localiseImages(cpai.images, zh)}
        syllabus={cpai.syllabus.map((module) => (zh ? module.titleZh : module.titleEn))}
        syllabusHeading={tr('credentialSyllabus')}
      />
      <StructuredData data={buildEventSeriesData({key: 'cpai', name: t('title'), description: t('description')}, locale as AppLocale)} />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, '/programs/cpai', tRoot))} />
    </>
  );
}
