import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ArchiveStories} from '@/components/home/archive-stories';
import {ConversionPaths} from '@/components/home/conversion-paths';
import {Ecosystem} from '@/components/home/ecosystem';
import {EventsJourney} from '@/components/home/events-journey';
import {GbaGateway} from '@/components/home/gba-gateway';
import {Hero} from '@/components/home/hero';
import {ImpactEvidence} from '@/components/home/impact-evidence';
import {LegacyNetwork} from '@/components/home/legacy-network';
import {MarketProducts} from '@/components/home/market-products';
import {OpenNow} from '@/components/home/open-now';
import {Outcomes} from '@/components/home/outcomes';
import {Pathways} from '@/components/home/pathways';
import {ProgrammeShowcase} from '@/components/home/programme-showcase';
import {StructuredData} from '@/components/seo/structured-data';
import type {AppLocale} from '@/i18n/routing';
import {buildEcosystemIndustries} from '@/lib/home/ecosystem-industries';
import {loadLegacyNetworkGroups} from '@/lib/home/legacy-network-groups';
import {buildPageMetadata} from '@/lib/metadata';
import {buildOrganizationData, buildWebSiteData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

// 13 sections, each an independent read: Promise.all fans every section's own
// .catch(() => [])/Promise.allSettled read out in parallel, so one slow or failing model
// never blocks another. Ecosystem and LegacyNetwork are 'use client' presentational
// components -- their data/translation resolution happens here, in server code, and is
// passed down as plain serializable props (Tasks 8 and 13).
export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;

  const [
    hero, openNow, pathways, eventsJourney, marketProducts, outcomes,
    programmeShowcase, gbaGateway, impactEvidence, archiveStories, conversionPaths,
    ecosystemT, legacyNetworkGroups, legacyNetworkT,
  ] = await Promise.all([
    Hero({locale: appLocale}),
    OpenNow({locale: appLocale}),
    Pathways({locale: appLocale}),
    EventsJourney({locale: appLocale}),
    MarketProducts({locale: appLocale}),
    Outcomes({locale: appLocale}),
    ProgrammeShowcase({locale: appLocale}),
    GbaGateway({locale: appLocale}),
    ImpactEvidence({locale: appLocale}),
    ArchiveStories({locale: appLocale}),
    ConversionPaths({locale: appLocale}),
    getTranslations({locale, namespace: 'Home.ecosystem'}),
    loadLegacyNetworkGroups(appLocale),
    getTranslations({locale, namespace: 'Home.legacyNetwork'}),
  ]);

  const ecosystemIndustries = buildEcosystemIndustries((key) => ecosystemT(key));

  return (
    <>
      <StructuredData data={buildOrganizationData()} />
      <StructuredData data={buildWebSiteData()} />
      {hero}
      {openNow}
      {pathways}
      {eventsJourney}
      {marketProducts}
      {outcomes}
      <Ecosystem
        industries={ecosystemIndustries}
        labels={{
          eyebrow: ecosystemT('eyebrow'),
          title: ecosystemT('title'),
          intro: ecosystemT('intro'),
          selectedLabel: ecosystemT('selectedLabel'),
          enterAction: ecosystemT('enterAction'),
          focusAreas: ecosystemT.raw('focusAreas') as readonly string[],
        }}
      />
      {programmeShowcase}
      {gbaGateway}
      {impactEvidence}
      {archiveStories}
      <LegacyNetwork
        groups={legacyNetworkGroups}
        labels={{
          eyebrow: legacyNetworkT('eyebrow'),
          title: legacyNetworkT('title'),
          note: legacyNetworkT('note'),
          viewAllAction: legacyNetworkT('viewAllAction'),
          // Raw, not translated: the {shown}/{total} placeholders are filled in client-side
          // by LegacyNetwork itself (Task 13), the same pattern Footer.newsletter.mailBody
          // uses for {email} -- a function cannot cross the server/client boundary as a prop,
          // so the template string does instead.
          previewNote: legacyNetworkT.raw('previewNote') as string,
          tabs: {
            supporting: legacyNetworkT('tabs.supporting'),
            regional: legacyNetworkT('tabs.regional'),
            media: legacyNetworkT('tabs.media'),
          },
        }}
      />
      {conversionPaths}
    </>
  );
}
