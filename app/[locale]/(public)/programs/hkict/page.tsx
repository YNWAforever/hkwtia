import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorySection} from '@/components/marketing/story-section';
import {
  localiseImages,
  localiseWinners,
  ProgramEditions
} from '@/components/marketing/program-editions';
import {PageHero} from '@/components/wt/page-hero';
import {RichCompass} from '@/components/wt/rich-compass';
import {siteConfig} from '@/config/site';
import {programs} from '@/content/programs';
import {AGENCIES} from '@/content/programs/agencies';
import {hkict} from '@/content/programs/hkict';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';
import {buildProgrammeHeaderFacts} from '@/lib/programs/programme-header';

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
  const common = await getTranslations({locale, namespace: 'Common'});
  const zh = locale === 'zh-HK';

  const summary = summarizeProgrammes().find((item) => item.id === 'hkict')!;
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
