import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramDetail} from '@/components/marketing/program-detail';
import {
  localiseImages,
  localiseWinners,
  ProgramEditions
} from '@/components/marketing/program-editions';
import {programs} from '@/content/programs';
import {AGENCIES} from '@/content/programs/agencies';
import {hkict} from '@/content/programs/hkict';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'hkict')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/hkict', title: t('title'), description: t('description'), image: program.image});
}

export default async function HkictPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const zh = locale === 'zh-HK';

  return (
    <>
      <ProgramDetail
        program={program}
        title={t('title')}
        description={t('description')}
        statusHeading={tr('statusHeading')}
        status={t('status')}
      />
      <ProgramEditions
        categoryHeading={tr('categoryHeading')}
        editionsHeading={tr('editionsHeading')}
        winnersHeading={tr('winnersHeading')}
        winnersOffSite={tr('winnersOffSite')}
        winnersOffSiteLink={tr('winnersOffSiteLink')}
        winnersUnrecorded={tr('winnersUnrecorded')}
        editions={hkict.editions.map((edition) => ({
          heading: String(edition.year),
          // OGCIO through 2024, DPO from 2025. Per edition, from each
          // edition's own page — WTIA's 2025 page claims six consecutive
          // years of DPO support, which would back-date the rename to 2020.
          lines: [
            tr('organisedFor', {
              agency: zh
                ? AGENCIES[edition.organisedFor].nameZh
                : AGENCIES[edition.organisedFor].nameEn
            })
          ],
          winners: localiseWinners(edition.winners, zh),
          images: localiseImages(edition.images, zh)
        }))}
      />
    </>
  );
}
