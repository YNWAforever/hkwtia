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
import {asa} from '@/content/programs/asa';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'asa')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/asa', title: t('title'), description: t('description'), image: program.image});
}

export default async function AsaPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  const tr = await getTranslations({locale, namespace: 'programs.record'});
  const zh = locale === 'zh-HK';

  return (
    <>
      <ProgramDetail program={program} title={t('title')} description={t('description')} status={t('status')} />
      <ProgramEditions
        categoryHeading={tr('categoryHeading')}
        editionsHeading={tr('editionsHeading')}
        winnersHeading={tr('winnersHeading')}
        winnersOffSite={tr('winnersOffSite')}
        winnersOffSiteLink={tr('winnersOffSiteLink')}
        winnersUnrecorded={tr('winnersUnrecorded')}
        editions={asa.editions.map((edition) => {
          const lines: string[] = [];

          // Three funder sentences for three archive shapes. Four editions name
          // Create Hong Kong and no scheme, so they get the shorter one rather
          // than a scheme inferred from a neighbouring edition.
          if (edition.funder.kind === 'named') {
            const agency = zh
              ? AGENCIES[edition.funder.agency].nameZh
              : AGENCIES[edition.funder.agency].nameEn;
            lines.push(
              edition.funder.initiative
                ? tr('fundedBy', {
                    agency,
                    initiative: zh ? edition.funder.initiative.zh : edition.funder.initiative.en
                  })
                : tr('fundedByAgency', {agency})
            );
          }

          // Co-organising and attending are different measurements of different
          // eras, so they get different sentences and `unrecorded` renders none.
          if (edition.regions.kind !== 'unrecorded') {
            lines.push(
              tr(edition.regions.kind === 'attended' ? 'regionsAttended' : 'regionsCoOrganised', {
                count: edition.regions.count
              })
            );
          }

          return {
            heading: zh ? edition.labelZh : edition.labelEn,
            lines,
            winners: localiseWinners(edition.winners, zh),
            images: localiseImages(edition.images, zh)
          };
        })}
      />
    </>
  );
}
