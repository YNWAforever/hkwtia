import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramCredential} from '@/components/marketing/program-credential';
import {ProgramDetail} from '@/components/marketing/program-detail';
import {localiseImages} from '@/components/marketing/program-editions';
import {programs} from '@/content/programs';
import {cpai} from '@/content/programs/cpai';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

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
  const zh = locale === 'zh-HK';

  return (
    <>
      <ProgramDetail program={program} title={t('title')} description={t('description')} status={t('status')} />
      <ProgramCredential
        courseName={zh ? cpai.courseNameZh : cpai.courseNameEn}
        coursePartner={zh ? cpai.coursePartnerZh : cpai.coursePartnerEn}
        coursePartnerHeading={tr('credentialCoursePartner')}
        images={localiseImages(cpai.images, zh)}
        issuer={zh ? cpai.issuerZh : cpai.issuerEn}
        issuerHeading={tr('credentialIssuer')}
        // 「一個課程，兩張認證」: WTIA issues CPAI, CUSCS separately issues its
        // own completion certificate. Naming only the first two states half of
        // it, which is the half the content audit got wrong.
        partnerCertificate={zh ? cpai.partnerCertificateZh : cpai.partnerCertificateEn}
        partnerCertificateHeading={tr('credentialPartnerCertificate')}
        syllabus={cpai.syllabus.map((module) => (zh ? module.titleZh : module.titleEn))}
        syllabusHeading={tr('credentialSyllabus')}
      />
    </>
  );
}
