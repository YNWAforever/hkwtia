import {
  authoritativeSourceInventory,
  reportedArchiveIdentity,
} from "@/config/wisetech-authoritative-source-inventory";

export const integrationKinds = ["route", "cta", "form", "locale", "asset"] as const;
export const integrationDispositions = ["retain", "merge", "redirect", "retire"] as const;
export const evidenceKinds = [
  "site-v13-source",
  "site-v13-design-doc",
  "master-plan",
  "hkwtia-repository",
] as const;

export type IntegrationKind = (typeof integrationKinds)[number];
export type IntegrationDisposition = (typeof integrationDispositions)[number];
export type IntegrationEvidence = (typeof evidenceKinds)[number];
export type DurableOwner = "events" | "cohorts";

export type IntegrationManifestEntry = Readonly<{
  id: string;
  kind: IntegrationKind;
  source: string;
  canonicalPath: string | null;
  disposition: IntegrationDisposition;
  dataOwner: string;
  rationale: string;
  evidence: IntegrationEvidence;
  sourceEvidenceId?: string;
  destinationChain?: readonly string[];
  durableOwners?: readonly DurableOwner[];
  localeMechanism?: "next-intl-router-replace";
}>;

export const wisetechIntegrationProvenance = Object.freeze({
  repositoryBaseSha: "c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f",
  reportedArchiveIdentity: Object.freeze({...reportedArchiveIdentity}),
  authoritativeDonor: Object.freeze({
    ...authoritativeSourceInventory.identity,
    reconciliationStatus: "locally-reconciled" as const,
    continuityWithReportedArchive: false as const,
  }),
});

function entry(value: IntegrationManifestEntry): IntegrationManifestEntry {
  return Object.freeze({
    ...value,
    ...(value.destinationChain === undefined
      ? {}
      : {destinationChain: Object.freeze([...value.destinationChain])}),
    ...(value.durableOwners === undefined
      ? {}
      : {durableOwners: Object.freeze([...value.durableOwners])}),
  });
}

const repositoryRoutes: readonly IntegrationManifestEntry[] = [
  ["route-home", "/", "App Router home page and its repository/CMS read models."],
  ["route-about", "/about", "App Router about page and page-copy namespace."],
  ["route-about-chairman", "/about/chairman", "App Router chairman page and approved copy/media."],
  ["route-about-committees", "/about/committees", "App Router committees page and approved governance copy."],
  ["route-about-history", "/about/history", "Typed institutional history records and repository archive media."],
  ["route-about-history-detail", "/about/history/[slug]", "Typed milestone records keyed by slug."],
  ["route-events", "/events", "Published events repository and event CMS."],
  ["route-event-detail", "/events/[slug]", "Published event detail repository keyed by slug."],
  ["route-program-asa", "/programs/asa", "Verified typed ASA programme record."],
  ["route-program-cpai", "/programs/cpai", "Verified typed CPAI programme record."],
  ["route-program-hkict", "/programs/hkict", "Verified typed HKICT programme record."],
  ["route-program-tct", "/programs/tct", "Verified typed Tech to Connect programme record."],
  ["route-membership", "/membership", "Membership page copy plus canonical plan codes."],
  ["route-join", "/join", "Neon Auth and membership application state."],
  ["route-join-profile", "/join/profile", "Authenticated join profile step."],
  ["route-join-company", "/join/company", "Authenticated company step."],
  ["route-join-checkout", "/join/checkout", "Server-owned Stripe checkout step."],
  ["route-join-complete", "/join/complete", "Join completion state."],
  ["route-showcase", "/showcase", "Published showcase listing repository."],
  ["route-showcase-detail", "/showcase/[slug]", "Published showcase detail and introduction lead action."],
  ["route-launchpad", "/launchpad", "Published cohorts and authenticated cohort applications."],
  ["route-news", "/news", "Published news repository and staff news CMS."],
  ["route-news-detail", "/news/[slug]", "Published news detail repository keyed by slug."],
  ["route-ai-ops", "/ai-ops", "Materialised AI operations metrics and evidence links."],
  ["route-ai-transparency", "/ai-transparency", "Fixed trust structure plus page copy."],
  ["route-contact", "/contact", "Repository-owned contact details and page copy; no inquiry record is claimed."],
  ["route-privacy", "/privacy", "Reviewed fixed policy structure."],
  ["route-unsubscribe", "/unsubscribe", "Signed suppression workflow and system data."],
  ["route-portal", "/portal", "Authenticated member dashboard."],
  ["route-portal-profile", "/portal/profile", "Member-owned profile data."],
  ["route-portal-company", "/portal/company", "Company-owned profile data."],
  ["route-portal-company-seats", "/portal/company/seats", "Company seat and invitation records."],
  ["route-portal-company-seats-accept", "/portal/company/seats/accept", "Seat invitation acceptance state."],
  ["route-portal-directory", "/portal/directory", "Authenticated member directory read model."],
  ["route-portal-company-listing", "/portal/company/listing", "Member-owned showcase draft and review state."],
  ["route-portal-events", "/portal/events", "Member event registrations."],
  ["route-portal-documents", "/portal/documents", "Approved member document surface."],
  ["route-portal-billing", "/portal/billing", "Server-owned billing portal journey."],
  ["route-admin", "/admin", "Staff-authorised CMS and CRM entry point."],
  ["route-concierge-api", "/api/ai/concierge", "Existing guarded Concierge API action."],
].map(([id, path, dataOwner]) => entry({
  id,
  kind: "route",
  source: path,
  canonicalPath: path,
  disposition: "retain",
  dataOwner,
  rationale: "The master-plan journey is already backed by a current hkwtia authority.",
  evidence: "hkwtia-repository",
}));

const redirectRoutes: readonly IntegrationManifestEntry[] = [
  ["route-legacy-projects", "/projects", "/programs/asa", "The explicit permanent redirect preserves the legacy project entry."],
  ["route-legacy-history", "/history", "/about", "The explicit permanent redirect preserves the legacy history entry."],
  ["route-design-members", "/members", "/showcase", "The explicit redirect consolidates public discovery under showcase."],
  ["route-legacy-member-detail", "/members/:id", "/showcase", "The explicit redirect avoids presenting an unverified member profile."],
].map(([id, source, canonicalPath, rationale]) => entry({
  id,
  kind: "route",
  source,
  canonicalPath,
  disposition: "redirect",
  dataOwner: "next.config.ts redirects and the destination App Router page.",
  rationale,
  evidence: "hkwtia-repository",
}));

const designRouteMerges: readonly IntegrationManifestEntry[] = [
  ["route-design-why-wisetech", "/why-wisetech", "/about", "Association identity and evolution already belong to About."],
  ["route-design-for-corporates", "/for-corporates", "/membership", "Corporate participation belongs to the canonical membership journey."],
  ["route-design-for-smes", "/for-smes", "/events", "Current practical participation is represented only by published events."],
  ["route-design-for-startups", "/for-startups", "/showcase", "Startup solution discovery belongs to the reviewed showcase."],
  ["route-design-for-professionals", "/for-professionals", "/membership", "Professional participation belongs to the canonical membership journey."],
  ["route-design-for-gba-global", "/for-gba-global", "/launchpad", "The existing cohort surface is the only durable GBA/global pathway."],
  ["route-design-ai-plus", "/ai-plus", "/ai-transparency", "AI positioning must remain connected to the existing trust surface."],
  ["route-design-ai-plus-commerce", "/ai-plus/commerce-professional-services", "/showcase", "No separate verified sector dataset exists; use reviewed solutions."],
  ["route-design-ai-plus-manufacturing", "/ai-plus/manufacturing-robotics", "/showcase", "No separate verified sector dataset exists; use reviewed solutions."],
  ["route-design-ai-plus-health", "/ai-plus/health-life-sciences", "/showcase", "No separate verified sector dataset exists; use reviewed solutions."],
  ["route-design-ai-plus-retail", "/ai-plus/retail-creative-industries", "/showcase", "No separate verified sector dataset exists; use reviewed solutions."],
  ["route-design-ai-plus-education", "/ai-plus/education-future-of-work", "/events", "No training catalogue exists; only published events are current opportunities."],
  ["route-design-ai-plus-responsible", "/ai-plus/responsible-ai-data-cybersecurity", "/ai-transparency", "Responsible-AI claims belong to the existing trust surface."],
  ["route-design-member-detail", "/members/[slug]", "/showcase/[slug]", "Reviewed public organisation detail is owned by showcase listings."],
  ["route-design-solutions", "/solutions", "/showcase", "Reviewed solutions are already the public showcase."],
  ["route-design-solution-detail", "/solutions/[slug]", "/showcase/[slug]", "Reviewed solution detail is already the showcase detail."],
  ["route-design-submit-challenge", "/submit-challenge", "/contact", "No challenge record exists; Contact may explain channels without pretending submission persistence."],
  ["route-design-request-introduction", "/request-introduction", "/showcase/[slug]", "Consent-based introduction leads already belong to a published showcase record."],
  ["route-design-verification", "/verification", "/showcase", "Publication review remains part of the showcase rather than a new badge system."],
  ["route-design-activities", "/activities", "/events", "Published dated opportunities are owned by Events."],
  ["route-design-activity-ai-clinics", "/activities/ai-clinics", "/events", "Only a published event may represent an open clinic."],
  ["route-design-activity-buyer-days", "/activities/buyer-days", "/events", "Only a published event may represent an open buyer day."],
  ["route-design-activity-councils", "/activities/industry-councils", "/events", "No council participation model exists; published events are the durable surface."],
  ["route-design-activity-training", "/activities/training", "/events", "No training catalogue exists; published events are the durable surface."],
  ["route-design-activity-gba", "/activities/gba-delegations", "/launchpad", "Existing cohort records are the durable market-pathway surface."],
  ["route-design-activity-community", "/activities/community", "/events", "Only published events may be presented as reservable community activity."],
  ["route-design-activity-mentoring", "/activities/mentoring-volunteering", "/contact", "No volunteer record exists; Contact can state channels without a mock form."],
  ["route-design-host-activity", "/host-an-activity", "/contact", "No proposal record exists; Contact can state channels without a mock form."],
  ["route-design-program-launchpad", "/programmes/launchpad", "/launchpad", "The cohort-backed Launch Pad route is authoritative."],
  ["route-design-program-hkict", "/programmes/hkict", "/programs/hkict", "The verified typed HKICT record is authoritative."],
  ["route-design-program-asa", "/programmes/asa", "/programs/asa", "The verified typed ASA record is authoritative."],
  ["route-design-program-tct", "/programmes/tct", "/programs/tct", "The verified typed Tech to Connect record is authoritative."],
  ["route-design-program-cpai", "/programmes/cpai", "/programs/cpai", "The verified typed CPAI record is authoritative."],
  ["route-design-gba", "/gba", "/launchpad", "The cohort-backed Launch Pad route is the only durable market pathway."],
  ["route-design-gba-market-entry", "/gba/market-entry", "/launchpad", "The cohort-backed Launch Pad route is the only durable market pathway."],
  ["route-design-gba-delegations", "/gba/delegations", "/launchpad", "The cohort-backed Launch Pad route is the only durable market pathway."],
  ["route-design-gba-soft-landing", "/gba/soft-landing", "/contact", "No support-request record exists; Contact can state verified channels."],
  ["route-design-gba-partner-network", "/gba/partner-network", "/contact", "No verified partner directory exists; Contact can state verified channels."],
  ["route-design-gba-gone-global", "/gba/gone-global", "/showcase", "Only reviewed showcase records may support organisation outcome claims."],
  ["route-design-insights", "/insights", "/news", "Published editorial content is owned by News."],
  ["route-design-insights-case-studies", "/insights/case-studies", "/showcase", "Only reviewed showcase records may support outcome claims."],
  ["route-design-insights-guides", "/insights/guides", "/news", "No separate guide content type exists; published editorial content is News."],
  ["route-design-insights-industry", "/insights/industry-perspectives", "/news", "No separate perspective content type exists; published editorial content is News."],
  ["route-design-insights-responsible-ai", "/insights/responsible-ai", "/ai-transparency", "Responsible-AI claims belong to the trust surface."],
  ["route-design-insights-gba", "/insights/gba-intelligence", "/launchpad", "No separate intelligence content type exists; the cohort surface owns current pathways."],
  ["route-design-insights-replays", "/insights/event-replays", "/events", "Completed-event resources remain attached to event records."],
  ["route-design-insight-detail", "/insights/[slug]", "/news/[slug]", "Published editorial detail is owned by News."],
  ["route-design-join-success", "/join/success", "/join/complete", "The existing completion step is authoritative."],
  ["route-design-partner-with-us", "/partner-with-us", "/contact", "No partnership record exists; Contact can state verified channels."],
  ["route-design-about-leadership", "/about/leadership", "/about/chairman", "The current approved leadership profile is the chairman page."],
  ["route-design-about-governance", "/about/governance", "/about/committees", "The existing committees page is the verified governance surface."],
  ["route-design-responsible-ai", "/responsible-ai", "/ai-transparency", "Responsible-AI commitments belong to the existing trust surface."],
  ["route-design-portal-seats", "/portal/seats", "/portal/company/seats", "Company seat management already has a canonical nested route."],
  ["route-design-portal-solution", "/portal/solution", "/portal/company/listing", "Company showcase editing already has a canonical nested route."],
].map(([id, source, canonicalPath, rationale]) => entry({
  id,
  kind: "route",
  source,
  canonicalPath,
  disposition: "merge",
  dataOwner: "hkwtia App Router destination and its existing typed repository/CMS authority.",
  rationale,
  evidence: "site-v13-design-doc",
}));

const retiredDesignRoutes: readonly IntegrationManifestEntry[] = [
  ["route-design-programmes", "/programmes", "No generic programme index exists; four verified typed routes must not be flattened into one arbitrary destination."],
  ["route-design-program-detail", "/programmes/[slug]", "No generic programme repository or dynamic route exists."],
  ["route-design-program-edition", "/programmes/[slug]/[edition]", "No generic edition repository or dynamic route exists."],
  ["route-design-partners", "/partners", "No verified published partner model exists, so a logo wall would risk misrepresentation."],
  ["route-design-search", "/search", "No repository-backed public search surface exists."],
  ["route-design-accessibility", "/accessibility", "No reviewed standalone accessibility page exists."],
  ["route-design-terms", "/terms", "No reviewed standalone terms page exists."],
  ["route-design-portal-introductions", "/portal/introductions", "No member introduction inbox route exists."],
  ["route-design-portal-programmes", "/portal/programmes", "No member programme-management route exists."],
  ["route-design-portal-councils", "/portal/councils", "No member council-management route exists."],
  ["route-design-portal-gba", "/portal/gba", "No member GBA-management route exists."],
  ["route-design-portal-preferences", "/portal/preferences", "No consolidated preferences route exists."],
].map(([id, source, rationale]) => entry({
  id,
  kind: "route",
  source,
  canonicalPath: null,
  disposition: "retire",
  dataOwner: "No current hkwtia App Router page or durable repository authority.",
  rationale,
  evidence: "site-v13-design-doc",
}));

const authoritativeDonorRouteAliases: readonly IntegrationManifestEntry[] = [
  entry({id: "route-source-event-asia-smart-innovation-awards-summit-2025", kind: "route", source: "/events/asia-smart-innovation-awards-summit-2025", canonicalPath: "/events/[slug]", disposition: "merge", dataOwner: "Published events repository and event CMS; source evidence is not publication state.", rationale: "Historical donor event evidence only; this mapping neither seeds nor publishes an hkwtia event.", evidence: "site-v13-source"}),
  entry({id: "route-source-event-smart-innovation-meets-genai", kind: "route", source: "/events/smart-innovation-meets-genai", canonicalPath: "/events/[slug]", disposition: "merge", dataOwner: "Published events repository and event CMS; source evidence is not publication state.", rationale: "Historical donor event evidence only; this mapping neither seeds nor publishes an hkwtia event.", evidence: "site-v13-source"}),
  entry({id: "route-source-program-tech-connect", kind: "route", source: "/programmes/tech-connect", canonicalPath: "/programs/tct", disposition: "merge", dataOwner: "Verified typed Tech to Connect programme record.", rationale: "The donor programme path is source evidence only; the current typed record remains authoritative.", evidence: "site-v13-source"}),
  entry({id: "route-source-program-asia-smart-innovation-awards", kind: "route", source: "/programmes/asia-smart-innovation-awards", canonicalPath: "/programs/asa", disposition: "merge", dataOwner: "Verified typed ASA programme record.", rationale: "The donor programme path is source evidence only; the current typed record remains authoritative.", evidence: "site-v13-source"}),
  entry({id: "route-source-program-asia-smart-innovation-awards-2025", kind: "route", source: "/programmes/asia-smart-innovation-awards/2025", canonicalPath: "/programs/asa", disposition: "merge", dataOwner: "Verified typed ASA programme record.", rationale: "The donor edition path is evidence only and does not manufacture an hkwtia programme edition.", evidence: "site-v13-source"}),
  entry({id: "route-source-program-hkict-startup-award", kind: "route", source: "/programmes/hkict-startup-award", canonicalPath: "/programs/hkict", disposition: "merge", dataOwner: "Verified typed HKICT programme record.", rationale: "The donor programme path is source evidence only; the current typed record remains authoritative.", evidence: "site-v13-source"}),
];

const donorSitemapEvidenceBySource = new Map(
  authoritativeSourceInventory.sitemapRoutes.map(({id, sourcePath}) => [sourcePath, id]),
);

function attachDonorSitemapEvidence(manifestEntry: IntegrationManifestEntry): IntegrationManifestEntry {
  const sourceEvidenceId = donorSitemapEvidenceBySource.get(manifestEntry.source);
  return sourceEvidenceId === undefined ? manifestEntry : entry({...manifestEntry, sourceEvidenceId});
}

const contractEntries: readonly IntegrationManifestEntry[] = [
  entry({id: "cta-find-event", kind: "cta", source: "cta:find-event-or-activity", canonicalPath: "/events", disposition: "merge", dataOwner: "events repository and event CMS publication state.", rationale: "Only published events are actionable.", evidence: "master-plan", destinationChain: ["/events"]}),
  entry({id: "cta-join-wisetech", kind: "cta", source: "cta:join-wisetech", canonicalPath: "/membership", disposition: "merge", dataOwner: "canonical plan codes, membership application state and server-owned checkout.", rationale: "Visitors compare canonical plans before entering the focused join flow.", evidence: "master-plan", destinationChain: ["/membership", "/join?plan=<canonical-plan>"]}),
  entry({id: "cta-explore-members-solutions", kind: "cta", source: "cta:explore-members-solutions", canonicalPath: "/showcase", disposition: "merge", dataOwner: "reviewed showcase listings and curated media.", rationale: "Public discovery must use reviewed listings, not prototype logos.", evidence: "master-plan", destinationChain: ["/showcase"]}),
  entry({id: "cta-ask-wisetech", kind: "cta", source: "cta:ask-wisetech", canonicalPath: "/api/ai/concierge", disposition: "merge", dataOwner: "ConciergeWidget, guarded Concierge API, conversations and approvals.", rationale: "The Site presentation may change but the existing AI runtime remains authoritative.", evidence: "master-plan", destinationChain: ["/api/ai/concierge"]}),
  entry({id: "cta-register-interest", kind: "cta", source: "cta:register-interest", canonicalPath: "/events", disposition: "merge", dataOwner: "published events/event_registrations or published cohorts/cohort_applications.", rationale: "Interest may target only a real published event or cohort; general inquiry capture is not currently persisted.", evidence: "master-plan", destinationChain: ["/events", "/launchpad"], durableOwners: ["events", "cohorts"]}),
  entry({id: "form-event-registration", kind: "form", source: "form:event-registration", canonicalPath: "/events/[slug]", disposition: "retain", dataOwner: "events and event_registrations repositories.", rationale: "Registration is tied to a published event record.", evidence: "hkwtia-repository"}),
  entry({id: "form-cohort-application", kind: "form", source: "form:cohort-application", canonicalPath: "/launchpad", disposition: "retain", dataOwner: "cohorts and cohort_applications repositories.", rationale: "The form renders only when an open cohort exists.", evidence: "hkwtia-repository"}),
  entry({id: "form-showcase-introduction", kind: "form", source: "form:showcase-introduction", canonicalPath: "/showcase/[slug]", disposition: "retain", dataOwner: "reviewed showcase listing and leads repository.", rationale: "Introduction requests remain consent-based and listing-scoped.", evidence: "hkwtia-repository"}),
  entry({id: "locale-language-toggle", kind: "locale", source: "locale:site-language-toggle", canonicalPath: "/", disposition: "merge", dataOwner: "next-intl routing plus components/layout/locale-switcher.tsx.", rationale: "router.replace preserves the current path while localePrefix maps zh-HK to the public /zh prefix.", evidence: "hkwtia-repository", localeMechanism: "next-intl-router-replace"}),
];

const assetEntries: readonly IntegrationManifestEntry[] = [
  entry({id: "asset-wtia-logo", kind: "asset", source: "asset:wtia-logo", canonicalPath: "public/images/wtia-logo.png", disposition: "retain", dataOwner: "Tracked repository asset and legal WTIA identity.", rationale: "The tracked logo is repository evidence, not proof of any member or partner relationship.", evidence: "hkwtia-repository"}),
  entry({id: "asset-page-heroes", kind: "asset", source: "asset:page-heroes", canonicalPath: "public/images/", disposition: "retain", dataOwner: "Tracked repository assets used by current pages.", rationale: "Only tracked own-origin hero assets may be reused after rights and alt-text review.", evidence: "hkwtia-repository"}),
  entry({id: "asset-history-archive", kind: "asset", source: "asset:history-archive", canonicalPath: "public/images/history/", disposition: "retain", dataOwner: "Typed history records and tracked repository archive.", rationale: "Use only against the matching verified institutional record and reviewed alt text.", evidence: "hkwtia-repository"}),
  entry({id: "asset-programme-archive", kind: "asset", source: "asset:programme-archive", canonicalPath: "public/images/programs/", disposition: "retain", dataOwner: "Typed programme records and tracked repository archive.", rationale: "Use only against the matching verified programme evidence and reviewed alt text.", evidence: "hkwtia-repository"}),
  entry({id: "asset-site-photography", kind: "asset", source: "asset:site-v13-photography", canonicalPath: null, disposition: "retire", dataOwner: "Unavailable Site v13 source archive pending transfer and rights review.", rationale: "Design documents request real photography but expose no reconcilable archive filenames or rights evidence.", evidence: "site-v13-design-doc"}),
  entry({id: "asset-site-member-logos", kind: "asset", source: "asset:site-v13-member-logos", canonicalPath: null, disposition: "retire", dataOwner: "Unavailable Site v13 source archive plus reviewed showcase/member records.", rationale: "A prototype logo cannot be treated as proof of membership or publication approval.", evidence: "site-v13-design-doc"}),
  entry({id: "asset-site-partner-logos", kind: "asset", source: "asset:site-v13-partner-logos", canonicalPath: null, disposition: "retire", dataOwner: "Unavailable Site v13 source archive and a future approved partner authority.", rationale: "A prototype logo cannot be treated as proof of a current or historical partner relationship.", evidence: "site-v13-design-doc"}),
  entry({id: "asset-interface-icons", kind: "asset", source: "asset:site-v13-interface-icons", canonicalPath: "package:lucide-react", disposition: "merge", dataOwner: "Repository dependency and component-level accessible labels.", rationale: "Rebuild icon meaning with the installed system; do not import unidentified archive files.", evidence: "site-v13-design-doc"}),
];

export const wisetechIntegrationManifest: readonly IntegrationManifestEntry[] = Object.freeze([
  ...repositoryRoutes,
  ...redirectRoutes,
  ...designRouteMerges,
  ...retiredDesignRoutes,
  ...authoritativeDonorRouteAliases,
  ...contractEntries,
  ...assetEntries,
].map(attachDonorSitemapEvidence));
