import type {Metadata} from 'next';
import {Suspense} from 'react';
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
import {buildEcosystemIndustries, buildEcosystemLabels} from '@/lib/home/ecosystem-industries';
import {loadLegacyNetworkGroups} from '@/lib/home/legacy-network-groups';
import {buildLegacyNetworkLabels} from '@/lib/home/legacy-network-labels';
import {buildPageMetadata} from '@/lib/metadata';
import {buildOrganizationData, buildWebSiteData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

// Resolve the hero first. Each subsequent read has its own Suspense boundary so a
// slow public model cannot delay the hero or every section that follows it.
async function EcosystemSection({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.ecosystem'});
  return <Ecosystem industries={buildEcosystemIndustries((key) => t(key))} labels={buildEcosystemLabels(t)} />;
}

async function LegacyNetworkSection({locale}: Readonly<{locale: AppLocale}>) {
  const [groups, t] = await Promise.all([
    loadLegacyNetworkGroups(locale),
    getTranslations({locale, namespace: 'Home.legacyNetwork'}),
  ]);
  return <LegacyNetwork groups={groups} labels={buildLegacyNetworkLabels(t)} />;
}

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;
  const hero = await Hero({locale: appLocale});

  return (
    <>
      <StructuredData data={buildOrganizationData()} />
      <StructuredData data={buildWebSiteData()} />
      {hero}
      <Suspense fallback={null}><OpenNow locale={appLocale} /></Suspense>
      <Suspense fallback={null}><Pathways locale={appLocale} /></Suspense>
      <Suspense fallback={null}><EventsJourney locale={appLocale} /></Suspense>
      <Suspense fallback={null}><MarketProducts locale={appLocale} /></Suspense>
      <Suspense fallback={null}><Outcomes locale={appLocale} /></Suspense>
      <Suspense fallback={null}><EcosystemSection locale={appLocale} /></Suspense>
      <Suspense fallback={null}><ProgrammeShowcase locale={appLocale} /></Suspense>
      <Suspense fallback={null}><GbaGateway locale={appLocale} /></Suspense>
      <Suspense fallback={null}><ImpactEvidence locale={appLocale} /></Suspense>
      <Suspense fallback={null}><ArchiveStories locale={appLocale} /></Suspense>
      <Suspense fallback={null}><LegacyNetworkSection locale={appLocale} /></Suspense>
      <Suspense fallback={null}><ConversionPaths locale={appLocale} /></Suspense>
    </>
  );
}
