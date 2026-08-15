import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramDetail} from '@/components/marketing/program-detail';
import {localiseImages, ProgramEditions} from '@/components/marketing/program-editions';
import {programs} from '@/content/programs';
import {tct} from '@/content/programs/tct';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'tct')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/tct', title: t('title'), description: t('description'), image: program.image});
}

export default async function TctPage({params}: Props) {
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
        editions={tct.editions.map((edition) => {
          const lines: string[] = [];

          // A scheme with no body attached — the archive's prose names GSP once
          // and never says who administers it. Not the same sentence as ASA's,
          // which names a government body.
          if (edition.funder.kind === 'named') {
            lines.push(
              tr('fundedByScheme', {
                scheme: zh ? edition.funder.schemeZh : edition.funder.schemeEn
              })
            );
          }
          lines.push(zh ? edition.shapeZh : edition.shapeEn);

          return {
            // The label, not the year: these editions are named ("Tech to
            // Connect 4.0") and the series was renamed to Tech Connect mid-run.
            heading: zh ? edition.labelZh : edition.labelEn,
            lines,
            // No `winners` key at all. TCT is a seminar and workshop series,
            // not an award, so it has none to record or to declare missing.
            images: localiseImages(edition.images, zh)
          };
        })}
      />
    </>
  );
}
