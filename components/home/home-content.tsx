import { Suspense } from "react";
import {
  getHomeTranslations,
  type HomeCopyProps,
} from "@/lib/home/copy-preview";

import { ArchiveStories, homeArchiveStories } from "@/components/home/archive-stories";
import { ConversionPaths } from "@/components/home/conversion-paths";
import { Ecosystem } from "@/components/home/ecosystem";
import { EventsJourney } from "@/components/home/events-journey";
import { GbaGateway } from "@/components/home/gba-gateway";
import { Hero } from "@/components/home/hero";
import { ImpactEvidence } from "@/components/home/impact-evidence";
import { LegacyNetwork } from "@/components/home/legacy-network";
import { MarketProducts } from "@/components/home/market-products";
import { OpenNow } from "@/components/home/open-now";
import { Pathways } from "@/components/home/pathways";
import { ProgrammeShowcase } from "@/components/home/programme-showcase";
import { StructuredData } from "@/components/seo/structured-data";
import {
  buildEcosystemIndustries,
  buildEcosystemLabels,
} from "@/lib/home/ecosystem-industries";
import { loadLegacyNetworkGroups } from "@/lib/home/legacy-network-groups";
import { buildLegacyNetworkLabels } from "@/lib/home/legacy-network-labels";
import { buildOrganizationData, buildWebSiteData } from "@/lib/structured-data";

// Resolve the hero first. Each subsequent read has its own Suspense boundary so a
// slow public model cannot delay the hero or every section that follows it.
async function EcosystemSection({ locale, copyOverrides }: HomeCopyProps) {
  const t = await getHomeTranslations({
    locale,
    copyOverrides,
    namespace: "Home.ecosystem",
  });
  // The directory and the marketplace are where an industry pathway leads, so they close this
  // chapter rather than open their own (2026-10-06 consolidation). Their own boundary keeps the
  // two repository reads from holding back the industry board.
  return (
    <Ecosystem
      industries={buildEcosystemIndustries((key) => t(key))}
      labels={buildEcosystemLabels(t)}
    >
      <Suspense fallback={null}>
        <MarketProducts locale={locale} copyOverrides={copyOverrides} embedded />
      </Suspense>
    </Ecosystem>
  );
}

// The figures and the photographs make one claim -- a platform with a record -- so the impact
// figures run as the evidence line of the archive section. With no archive photographs (D-9
// hides that section), the figures keep their own section instead of disappearing with it.
async function ProofSection({ locale, copyOverrides }: HomeCopyProps) {
  if (homeArchiveStories().length === 0) {
    return <ImpactEvidence locale={locale} copyOverrides={copyOverrides} />;
  }
  return (
    <ArchiveStories locale={locale} copyOverrides={copyOverrides}>
      <Suspense fallback={null}>
        <ImpactEvidence locale={locale} copyOverrides={copyOverrides} embedded />
      </Suspense>
    </ArchiveStories>
  );
}

async function LegacyNetworkSection({ locale, copyOverrides }: HomeCopyProps) {
  const [groups, t] = await Promise.all([
    loadLegacyNetworkGroups(locale),
    getHomeTranslations({
      locale,
      copyOverrides,
      namespace: "Home.legacyNetwork",
    }),
  ]);
  return <LegacyNetwork groups={groups} labels={buildLegacyNetworkLabels(t)} />;
}

export async function HomeContent({ locale, copyOverrides }: HomeCopyProps) {
  const [hero, t] = await Promise.all([
    Hero({ locale, copyOverrides }),
    getHomeTranslations({ locale, copyOverrides, namespace: "Home.openNow" }),
  ]);

  return (
    <>
      <StructuredData data={buildOrganizationData()} />
      <StructuredData data={buildWebSiteData()} />
      {hero}
      <Suspense
        fallback={
          <section
            id="home-discover"
            aria-busy="true"
            className="section opportunity-section min-h-svh"
          >
            <div className="shell">
              <p role="status">{t("loading")}</p>
            </div>
          </section>
        }
      >
        <OpenNow locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <Pathways locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <EventsJourney locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <EcosystemSection locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <ProgrammeShowcase locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <GbaGateway locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <ProofSection locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <LegacyNetworkSection locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
      <Suspense fallback={null}>
        <ConversionPaths locale={locale} copyOverrides={copyOverrides} />
      </Suspense>
    </>
  );
}
