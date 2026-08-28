import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  authoritativeSourceInventory,
  reportedArchiveIdentity,
} from "@/config/wisetech-authoritative-source-inventory";
import {
  validateAuthoritativeSourceInventory,
} from "@/lib/integration/authoritative-source-reconciliation";

const resolvableDestinations = new Set([
  "/", "/about", "/about/chairman", "/about/committees", "/about/history", "/ai-ops",
  "/ai-transparency", "/contact", "/events", "/events/[slug]", "/join", "/join/complete",
  "/launchpad", "/membership", "/news", "/news/[slug]", "/portal", "/portal/billing",
  "/portal/company", "/portal/company/listing", "/portal/company/seats", "/portal/directory",
  "/portal/documents", "/portal/events", "/portal/profile", "/privacy", "/programs/asa",
  "/programs/cpai", "/programs/hkict", "/programs/tct", "/showcase", "/showcase/[slug]",
  "/unsubscribe",
]);

const expectedSitemapPaths = [
  "/", "/why-wisetech", "/ai-plus", "/ai-plus/commerce-professional-services",
  "/ai-plus/manufacturing-robotics", "/ai-plus/health-life-sciences",
  "/ai-plus/retail-creative-industries", "/ai-plus/education-future-of-work",
  "/ai-plus/responsible-ai-data-cybersecurity", "/for-corporates", "/for-smes",
  "/for-startups", "/for-professionals", "/for-gba-global", "/members", "/solutions",
  "/events", "/events/asia-smart-innovation-awards-summit-2025",
  "/events/smart-innovation-meets-genai", "/activities", "/activities/ai-clinics",
  "/activities/buyer-days", "/activities/industry-councils", "/activities/training",
  "/activities/gba-delegations", "/activities/community",
  "/activities/mentoring-volunteering", "/host-an-activity", "/programmes",
  "/programmes/tech-connect", "/programmes/asia-smart-innovation-awards",
  "/programmes/asia-smart-innovation-awards/2025", "/programmes/hkict-startup-award",
  "/programmes/cpai", "/programmes/launchpad", "/gba", "/gba/market-entry",
  "/gba/delegations", "/gba/soft-landing", "/gba/partner-network", "/gba/gone-global",
  "/membership", "/join", "/partner-with-us", "/partners", "/insights",
  "/insights/case-studies", "/insights/guides", "/insights/industry-perspectives",
  "/insights/responsible-ai", "/insights/gba-intelligence", "/insights/event-replays",
  "/about", "/about/history", "/about/leadership", "/about/committees",
  "/about/governance", "/responsible-ai", "/verification", "/submit-challenge",
  "/request-introduction", "/contact", "/accessibility", "/privacy", "/terms",
  "/ai-transparency", "/ai-ops",
];

const expectedDispatcherRows = [
  ["/search", "retire", null],
  ["/join/success", "merge", "/join/complete"],
  ["/events/[slug]", "merge", "/events/[slug]"],
  ["/members/[slug]", "merge", "/showcase/[slug]"],
  ["/solutions/[slug]", "merge", "/showcase/[slug]"],
  ["/insights/[slug]", "merge", "/news/[slug]"],
  ["/ai-plus/[slug]", "retire", null],
  ["/programmes/[slug]", "retire", null],
  ["/programmes/[slug]/[edition]", "retire", null],
  ["/programmes/hkict", "merge", "/programs/hkict"],
  ["/programmes/asa", "merge", "/programs/asa"],
  ["/programmes/tct", "merge", "/programs/tct"],
  ["/portal/profile", "merge", "/portal/profile"],
  ["/portal/company", "merge", "/portal/company"],
  ["/portal/seats", "merge", "/portal/company/seats"],
  ["/portal/directory", "merge", "/portal/directory"],
  ["/portal/introductions", "retire", null],
  ["/portal/solution", "merge", "/portal/company/listing"],
  ["/portal/events", "merge", "/portal/events"],
  ["/portal/programmes", "retire", null],
  ["/portal/councils", "retire", null],
  ["/portal/gba", "retire", null],
  ["/portal/documents", "merge", "/portal/documents"],
  ["/portal/billing", "merge", "/portal/billing"],
  ["/portal/preferences", "retire", null],
  ["/404", "retire", null],
  ["/*", "retire", null],
] as const;

const expectedNavigationRows = [
  ["events-activities", "root", "events", "retain", "/events"],
  ["events-activities", "column", "events?status=open", "merge", "/events"],
  ["events-activities", "column", "activities/ai-clinics", "merge", "/events"],
  ["events-activities", "column", "activities/buyer-days", "merge", "/events"],
  ["events-activities", "column", "activities/industry-councils", "merge", "/events"],
  ["events-activities", "column", "activities", "merge", "/events"],
  ["events-activities", "feature", "events#interest", "merge", "/events"],
  ["members-solutions", "root", "members", "redirect", "/showcase"],
  ["members-solutions", "column", "members", "redirect", "/showcase"],
  ["members-solutions", "column", "solutions", "merge", "/showcase"],
  ["members-solutions", "column", "request-introduction", "merge", "/showcase/[slug]"],
  ["members-solutions", "column", "submit-challenge", "merge", "/contact"],
  ["members-solutions", "column", "members", "redirect", "/showcase"],
  ["members-solutions", "feature", "submit-challenge", "merge", "/contact"],
  ["ai-plus", "root", "ai-plus", "merge", "/ai-transparency"],
  ["ai-plus", "column", "ai-plus", "merge", "/ai-transparency"],
  ["ai-plus", "column", "ai-plus/commerce-professional-services", "merge", "/showcase"],
  ["ai-plus", "column", "ai-plus/manufacturing-robotics", "merge", "/showcase"],
  ["ai-plus", "column", "ai-plus/responsible-ai-data-cybersecurity", "merge", "/ai-transparency"],
  ["ai-plus", "column", "ai-plus", "merge", "/ai-transparency"],
  ["ai-plus", "feature", "ai-plus", "merge", "/ai-transparency"],
  ["programmes-gba", "root", "programmes", "retire", null],
  ["programmes-gba", "column", "programmes", "retire", null],
  ["programmes-gba", "column", "programmes/launchpad", "merge", "/launchpad"],
  ["programmes-gba", "column", "gba/market-entry", "merge", "/launchpad"],
  ["programmes-gba", "column", "activities/gba-delegations", "merge", "/launchpad"],
  ["programmes-gba", "column", "programmes", "retire", null],
  ["programmes-gba", "feature", "gba/market-entry", "merge", "/launchpad"],
  ["insights-about", "root", "insights", "merge", "/news"],
  ["insights-about", "column", "insights/case-studies", "merge", "/showcase"],
  ["insights-about", "column", "insights/guides", "merge", "/news"],
  ["insights-about", "column", "about", "retain", "/about"],
  ["insights-about", "column", "responsible-ai", "merge", "/ai-transparency"],
  ["insights-about", "column", "insights", "merge", "/news"],
  ["insights-about", "feature", "responsible-ai", "merge", "/ai-transparency"],
] as const;

const expectedFormFlows = [
  ["event-filter", "event-filter-form", "/events", "merge", "/events"],
  ["directory-search", "directory-search-form", "/members", "redirect", "/showcase"],
  ["site-search", "site-search-form", "/search", "retire", null],
  ["partner-enquiry", "partner-enquiry-form", "/partner-with-us", "retire", null],
  ["submit-challenge", "task-enquiry-form", "/submit-challenge", "retire", null],
  ["request-introduction", "task-enquiry-form", "/request-introduction", "merge", "/showcase/[slug]"],
  ["host-an-activity", "task-enquiry-form", "/host-an-activity", "retire", null],
  ["contact", "task-enquiry-form", "/contact", "retire", null],
  ["activity-updates", "activity-updates-form", "/footer/activity-updates", "retire", null],
] as const;

type DeepMutable<T> =
  T extends readonly (infer U)[] ? DeepMutable<U>[] :
  T extends object ? {-readonly [K in keyof T]: DeepMutable<T[K]>} :
  T;

type MutableInventory = DeepMutable<typeof authoritativeSourceInventory>;

function cloneInventory(): MutableInventory {
  return structuredClone(authoritativeSourceInventory) as unknown as MutableInventory;
}

function mutableRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function codes(value: unknown) {
  return validateAuthoritativeSourceInventory(value, resolvableDestinations).map(({code}) => code);
}

function expectInvalid(value: unknown, code: string) {
  expect(codes(value)).toContain(code);
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("WiseTech authoritative-source reconciliation", () => {
  it("pins both exact source identities and keeps their provenance discontinuous", () => {
    expect(authoritativeSourceInventory.identity).toEqual({
      repository: "https://github.com/YNWAforever/wisetech",
      commit: "f91ecc5fa29c2b9d416ed8315f23e9492baf993d",
      tree: "d13a99e6c47f2b3ea279c5d02da5cf15008807b7",
      trackedFileCount: 138,
      treeListingSha256: "79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c",
    });
    expect(reportedArchiveIdentity).toEqual({
      projectSlug: "wisetech-hong-kong",
      savedVersion: 13,
      commit: "d2d82c01099490a8c2768c942186735667bbc881",
      archiveSha256: "411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54",
      equivalenceStatus: "unverified",
    });
    expect(authoritativeSourceInventory.identity.commit).not.toBe(reportedArchiveIdentity.commit);
    expect(authoritativeSourceInventory.identity.treeListingSha256).not.toBe(reportedArchiveIdentity.archiveSha256);
  });

  it("records the exact locale, sitemap, dispatcher, component, content, and app-artifact sets", () => {
    expect(authoritativeSourceInventory.locales).toEqual([
      {donorLocale: "en", donorPrefix: "/en", hkwtiaLocale: "en", hkwtiaPathPrefix: "/"},
      {donorLocale: "zh", donorPrefix: "/zh", hkwtiaLocale: "zh-HK", hkwtiaPathPrefix: "/zh"},
    ]);
    expect(authoritativeSourceInventory.sitemapRoutes.map(({sourcePath}) => sourcePath)).toEqual(expectedSitemapPaths);
    expect(authoritativeSourceInventory.dispatcherOnlyRoutes.map(({sourcePath, disposition, canonicalPath}) => [sourcePath, disposition, canonicalPath])).toEqual(expectedDispatcherRows);
    expect(authoritativeSourceInventory.componentGroups).toEqual([
      {sourceFile: "app/WiseTechSite.tsx", functionCount: 33, disposition: "merge"},
      {sourceFile: "app/ExpansionPages.tsx", functionCount: 18, disposition: "merge"},
      {sourceFile: "app/FullInnerPages.tsx", functionCount: 16, disposition: "merge"},
    ]);
    expect(authoritativeSourceInventory.content).toEqual({
      bilingualRouteHeadingAssertions: 52,
      navigationHashTargetPageSets: 14,
      expandedInnerRouteChecks: 21,
      taskEnquiryRouteChecks: 4,
      traditionalChineseParityChecks: 5,
      completedHistoricalEvents: 2,
      historicalPartnerRecords: 79,
    });
    expect(authoritativeSourceInventory.sourceArtifacts.map(({sourceFile, disposition}) => [sourceFile, disposition])).toEqual([
      ["app/ExpansionPages.tsx", "merge"], ["app/FullInnerPages.tsx", "merge"],
      ["app/WiseTechSite.tsx", "merge"], ["app/[lang]/[[...slug]]/page.tsx", "merge"],
      ["app/[lang]/layout.tsx", "merge"], ["app/chatgpt-auth.ts", "retire"],
      ["app/globals.css", "merge"], ["app/layout.tsx", "merge"], ["app/megaNav.ts", "merge"],
      ["app/page.tsx", "retire"], ["app/partnerData.ts", "retire"],
      ["app/sitemap.ts", "merge"], ["app/visualData.ts", "merge"],
    ]);
  });

  it("records all 35 exact mega-nav placements with approved destination semantics", () => {
    expect(authoritativeSourceInventory.navigationTargets.map(({group, role, path, disposition, canonicalPath}) => [group, role, path, disposition, canonicalPath])).toEqual(expectedNavigationRows);
  });

  it("cross-references six physical forms to nine independently classified logical flows exactly once", () => {
    expect(authoritativeSourceInventory.forms.map(({id, sourceFile, component}) => [id, sourceFile, component])).toEqual([
      ["event-filter-form", "app/ExpansionPages.tsx", "EventsLandingPage"],
      ["directory-search-form", "app/WiseTechSite.tsx", "DirectoryPage"],
      ["site-search-form", "app/ExpansionPages.tsx", "SearchPage"],
      ["partner-enquiry-form", "app/ExpansionPages.tsx", "PartnerPage"],
      ["task-enquiry-form", "app/FullInnerPages.tsx", "EnquiryForm"],
      ["activity-updates-form", "app/WiseTechSite.tsx", "Footer"],
    ]);
    expect(authoritativeSourceInventory.formFlows.map(({id, formId, sourcePath, disposition, canonicalPath}) => [id, formId, sourcePath, disposition, canonicalPath])).toEqual(expectedFormFlows);
    const referenced = authoritativeSourceInventory.formFlows.map(({formId}) => formId);
    expect(new Set(referenced)).toEqual(new Set(authoritativeSourceInventory.forms.map(({id}) => id)));
  });

  it("preserves all 99 verified assets and keeps publication approval fail-closed", () => {
    expect(authoritativeSourceInventory.assets).toHaveLength(99);
    const categoryCounts = Object.fromEntries([...new Set(authoritativeSourceInventory.assets.map(({category}) => category))].sort().map((category) => [category, authoritativeSourceInventory.assets.filter((asset) => asset.category === category).length]));
    expect(categoryCounts).toEqual({
      "archive-image": 6,
      "brand-asset": 2,
      "editorial-image": 5,
      "historical-partner-logo": 79,
      "root-asset": 7,
    });
    const evidence = authoritativeSourceInventory.assets.map(({sourcePath, sha256, category}) => [sourcePath, sha256, category].join("|")).join("\n");
    expect(createHash("sha256").update(evidence).digest("hex")).toBe("c864faa2057bfe1257d0db9ff6166717d73a3cae90d957bfecdc0921bbbbff79");
    expect(authoritativeSourceInventory.assets.every(({disposition, rightsStatus, relationshipStatus, englishAltStatus, traditionalChineseAltStatus, publishable}) => disposition === "retire" && rightsStatus === "unreviewed" && relationshipStatus === "unreviewed" && englishAltStatus === "unreviewed" && traditionalChineseAltStatus === "unreviewed" && publishable === false)).toBe(true);
  });

  it("deep-freezes the complete checked-in evidence index", () => {
    expect(isDeeplyFrozen(authoritativeSourceInventory)).toBe(true);
    expect(isDeeplyFrozen(reportedArchiveIdentity)).toBe(true);
  });

  it("rejects wrong or missing exact identity and required top-level groups", () => {
    for (const key of ["repository", "commit", "tree", "trackedFileCount", "treeListingSha256"] as const) {
      const missing = cloneInventory();
      delete mutableRecord(missing.identity)[key];
      expectInvalid(missing, "contract-mismatch");
      const wrong = cloneInventory();
      mutableRecord(wrong.identity)[key] = key === "trackedFileCount" ? 137 : "wrong";
      expectInvalid(wrong, "contract-mismatch");
    }
    const collapsed = cloneInventory();
    mutableRecord(collapsed.identity).commit = reportedArchiveIdentity.commit;
    expectInvalid(collapsed, "identity-collapse");
    for (const key of ["locales", "sitemapRoutes", "dispatcherOnlyRoutes", "navigationTargets", "forms", "formFlows", "sourceArtifacts", "componentGroups", "content", "assets"] as const) {
      const hostile = cloneInventory();
      delete mutableRecord(hostile)[key];
      expectInvalid(hostile, "missing-group");
    }
  });

  it("rejects removed, duplicate, or drifted route, navigation, form, component, and content evidence", () => {
    const removedRoute = cloneInventory();
    removedRoute.sitemapRoutes.pop();
    expectInvalid(removedRoute, "contract-mismatch");
    const crossGroupDuplicate = cloneInventory();
    crossGroupDuplicate.dispatcherOnlyRoutes[0].sourcePath = crossGroupDuplicate.sitemapRoutes[0].sourcePath;
    expectInvalid(crossGroupDuplicate, "duplicate-classification");
    const navDrift = cloneInventory();
    navDrift.navigationTargets[7].canonicalPath = "/events";
    expectInvalid(navDrift, "contract-mismatch");
    const flowDrift = cloneInventory();
    flowDrift.formFlows.find((flow) => flow.id === "request-introduction")!.canonicalPath = "/contact";
    expectInvalid(flowDrift, "contract-mismatch");
    const missingFlow = cloneInventory();
    missingFlow.formFlows.pop();
    expectInvalid(missingFlow, "contract-mismatch");
    const badComponentCount = cloneInventory();
    badComponentCount.componentGroups[0].functionCount = 32;
    expectInvalid(badComponentCount, "contract-mismatch");
    const badContentCount = cloneInventory();
    mutableRecord(badContentCount.content).historicalPartnerRecords = 78;
    expectInvalid(badContentCount, "contract-mismatch");
  });

  it("rejects duplicate or malformed asset evidence and any unapproved publication", () => {
    const duplicate = cloneInventory();
    duplicate.assets[1] = {...duplicate.assets[0]};
    expectInvalid(duplicate, "duplicate-asset");
    const malformed = cloneInventory();
    delete mutableRecord(malformed.assets[0]).sha256;
    expectInvalid(malformed, "malformed-asset");
    const invalidDisposition = cloneInventory();
    mutableRecord(invalidDisposition.assets[0]).disposition = "copy";
    expectInvalid(invalidDisposition, "malformed-asset");
    const removedAsset = cloneInventory();
    removedAsset.assets.pop();
    expectInvalid(removedAsset, "contract-mismatch");
    const changedHash = cloneInventory();
    mutableRecord(changedHash.assets[0]).sha256 = "0".repeat(64);
    expectInvalid(changedHash, "contract-mismatch");
    const changedEvidence = cloneInventory();
    mutableRecord(changedEvidence.assets[0]).category = "root-asset";
    expectInvalid(changedEvidence, "contract-mismatch");
    const publishableLogo = cloneInventory();
    const logo = publishableLogo.assets.find((asset) => asset.category === "historical-partner-logo");
    mutableRecord(logo!).publishable = true;
    expectInvalid(publishableLogo, "unpublishable-asset");
  });

  it("accepts only the complete frozen authoritative fixture", () => {
    expect(validateAuthoritativeSourceInventory(authoritativeSourceInventory, resolvableDestinations)).toEqual([]);
  });
});
