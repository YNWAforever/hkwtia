import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramCredential} from '@/components/marketing/program-credential';
import {localiseImages} from '@/components/marketing/program-editions';
import {StorySection} from '@/components/marketing/story-section';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {cpai} from '@/content/programs/cpai';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'cpai')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/cpai', title: t('title'), description: t('description'), image: program.image});
}

export default async function CpaiPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const common = await getTranslations({locale, namespace: 'Common'});
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
        eyebrow={facts.typeLabel}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('title')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <RichCompass
        items={[
          {label: tr('compassFactLabel'), value: facts.fact},
          {label: tr('compassAudienceLabel'), value: t('audience')},
          {label: tr('compassActionLabel'), value: tr('askProgrammeTeam'), href: mailto}
        ]}
      />
      <StorySection heading={tr('statusHeading')} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{t('status')}</p>
      </StorySection>
      <ProgramCredential
        courseName={zh ? cpai.courseNameZh : cpai.courseNameEn}
        coursePartner={zh ? cpai.coursePartnerZh : cpai.coursePartnerEn}
        coursePartnerHeading={tr('credentialCoursePartner')}
        images={localiseImages(cpai.images, zh)}
        issuer={zh ? cpai.issuerZh : cpai.issuerEn}
        issuerHeading={tr('credentialIssuer')}
        // 「一個課程，兩張認證」: WTIA issues CPAI, CUSCS separately issues its own completion
        // certificate. Naming only the first two states half of it.
        partnerCertificate={zh ? cpai.partnerCertificateZh : cpai.partnerCertificateEn}
        partnerCertificateHeading={tr('credentialPartnerCertificate')}
        syllabus={cpai.syllabus.map((module) => (zh ? module.titleZh : module.titleEn))}
        syllabusHeading={tr('credentialSyllabus')}
      />
    </>
  );
}
