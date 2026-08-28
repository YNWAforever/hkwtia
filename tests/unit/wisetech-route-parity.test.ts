import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import {
  evidenceKinds,
  integrationDispositions,
  integrationKinds,
  wisetechIntegrationManifest,
  wisetechIntegrationProvenance,
} from "@/config/wisetech-integration-manifest";
import {
  authoritativeSourceInventory,
  reportedArchiveIdentity,
} from "@/config/wisetech-authoritative-source-inventory";
import type {IntegrationManifestEntry} from "@/config/wisetech-integration-manifest";
import {protectedRouteOwnershipInventory} from "@/config/wisetech-protected-route-inventory";
import {
  validateRouteParity,
} from "@/lib/integration/route-parity";
import {repositoryProtectedFiles} from "@/tests/helpers/wisetech-protected-route-discovery";

function filesNamed(directory: string, fileName: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return filesNamed(path, fileName);
    return item.isFile() && item.name === fileName ? [path] : [];
  });
}

function appRouteForPage(file: string): string {
  const appRoot = resolve(process.cwd(), "app", "[locale]");
  const segments = relative(appRoot, file)
    .replaceAll("\\", "/")
    .split("/")
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

const appRoutes = new Set(
  filesNamed(resolve(process.cwd(), "app", "[locale]"), "page.tsx").map(appRouteForPage),
);

async function validationDestinations() {
  const configured = ((await nextConfig.redirects?.()) ?? []) as readonly {
    source: string;
    destination: string;
  }[];
  return {
    appRoutes,
    redirects: new Map(configured.map(({source, destination}) => [source, destination])),
    conciergeActions: new Set(["/api/ai/concierge"]),
    protectedRoutes: {
      inventory: protectedRouteOwnershipInventory,
      codeFiles: repositoryProtectedFiles(),
    },
  };
}

function withIdentity(
  base: IntegrationManifestEntry,
  id: string,
  source: string,
  changes: Partial<IntegrationManifestEntry>,
): IntegrationManifestEntry {
  return {...base, id, source, ...changes};
}
type DonorRouteContractError = Readonly<{
  code: "missing-donor-route" | "duplicate-donor-route" | "wrong-source-evidence" | "wrong-route-contract";
  sourcePath: string;
}>;

function donorRouteContractErrors(
  entries: readonly IntegrationManifestEntry[],
): readonly DonorRouteContractError[] {
  const errors: DonorRouteContractError[] = [];
  for (const expected of authoritativeSourceInventory.sitemapRoutes) {
    const matches = entries.filter(({kind, source}) => kind === "route" && source === expected.sourcePath);
    if (matches.length === 0) {
      errors.push({code: "missing-donor-route", sourcePath: expected.sourcePath});
      continue;
    }
    if (matches.length > 1) {
      errors.push({code: "duplicate-donor-route", sourcePath: expected.sourcePath});
      continue;
    }
    const [match] = matches;
    if (match!.sourceEvidenceId !== expected.id) {
      errors.push({code: "wrong-source-evidence", sourcePath: expected.sourcePath});
    }
    if (match!.disposition !== expected.disposition || match!.canonicalPath !== expected.canonicalPath) {
      errors.push({code: "wrong-route-contract", sourcePath: expected.sourcePath});
    }
  }
  return errors;
}

function provenanceErrors(value: typeof wisetechIntegrationProvenance): readonly string[] {
  const errors: string[] = [];
  const donor = authoritativeSourceInventory.identity;
  const archive = value.reportedArchiveIdentity;
  const authoritativeDonor = value.authoritativeDonor;
  if (JSON.stringify(archive) !== JSON.stringify(reportedArchiveIdentity)) {
    errors.push("reported-archive-drift");
  }
  if (
    authoritativeDonor.repository !== donor.repository
    || authoritativeDonor.commit !== donor.commit
    || authoritativeDonor.tree !== donor.tree
    || authoritativeDonor.trackedFileCount !== donor.trackedFileCount
    || authoritativeDonor.treeListingSha256 !== donor.treeListingSha256
  ) {
    errors.push("authoritative-donor-drift");
  }
  if (authoritativeDonor.reconciliationStatus !== "locally-reconciled") {
    errors.push("donor-not-locally-reconciled");
  }
  if (authoritativeDonor.continuityWithReportedArchive !== false) {
    errors.push("false-archive-continuity");
  }
  const archiveSha256: string = archive.archiveSha256;
  const donorTree: string = authoritativeDonor.tree;
  const donorTreeListingSha256: string = authoritativeDonor.treeListingSha256;
  if (archiveSha256 === donorTree || archiveSha256 === donorTreeListingSha256) {
    errors.push("archive-sha-replaced-with-git-identity");
  }
  return errors;
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("WiseTech route parity manifest", () => {
  it("discovers the current App Router destination surface", () => {
    expect(appRoutes.size).toBeGreaterThanOrEqual(50);
    for (const route of [
      "/",
      "/unsubscribe",
      "/events/[slug]",
      "/news/[slug]",
      "/showcase/[slug]",
      "/about/history/[slug]",
    ]) {
      expect(appRoutes.has(route), route).toBe(true);
    }
  });

  it("keeps every entry typed, attributable and machine-readable", () => {
    const requiredFields = [
      "id", "kind", "source", "canonicalPath", "disposition", "dataOwner", "rationale", "evidence",
    ] as const;

    expect(wisetechIntegrationManifest.length).toBeGreaterThan(0);
    for (const item of wisetechIntegrationManifest) {
      for (const field of requiredFields) expect(item).toHaveProperty(field);
      expect(integrationKinds).toContain(item.kind);
      expect(integrationDispositions).toContain(item.disposition);
      expect(evidenceKinds).toContain(item.evidence);
      expect(item.id.trim(), `${item.id}: id`).not.toBe("");
      expect(item.source.trim(), `${item.id}: source`).not.toBe("");
      expect(item.dataOwner.trim(), `${item.id}: dataOwner`).not.toBe("");
      expect(item.rationale.trim(), `${item.id}: rationale`).not.toBe("");
    }
  });

  it("keeps IDs and source patterns unique and includes canonical dynamic routes", () => {
    const ids = wisetechIntegrationManifest.map(({id}) => id);
    const sources = wisetechIntegrationManifest.map(({source}) => source);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sources).size).toBe(sources.length);

    const routes = new Set(
      wisetechIntegrationManifest.filter(({kind}) => kind === "route").map(({canonicalPath}) => canonicalPath),
    );
    for (const route of [
      "/unsubscribe", "/events/[slug]", "/news/[slug]", "/showcase/[slug]", "/about/history/[slug]",
    ]) {
      expect(routes.has(route), route).toBe(true);
    }
  });

  it("maps the five Site CTA outcomes only onto existing durable journeys", () => {
    const byId = new Map(wisetechIntegrationManifest.map((item) => [item.id, item]));
    expect(byId.get("cta-find-event")?.destinationChain).toEqual(["/events"]);
    expect(byId.get("cta-join-wisetech")?.destinationChain).toEqual([
      "/membership", "/join?plan=<canonical-plan>",
    ]);
    expect(byId.get("cta-explore-members-solutions")?.destinationChain).toEqual(["/showcase"]);
    expect(byId.get("cta-ask-wisetech")?.destinationChain).toEqual(["/api/ai/concierge"]);
    expect(byId.get("cta-register-interest")?.destinationChain).toEqual(["/events", "/launchpad"]);
    expect(byId.get("cta-register-interest")?.durableOwners).toEqual(["events", "cohorts"]);
  });

  it("uses next-intl while preserving exact, discontinuous donor and archive provenance", () => {
    const locale = wisetechIntegrationManifest.find(({id}) => id === "locale-language-toggle");
    expect(locale?.localeMechanism).toBe("next-intl-router-replace");
    expect(JSON.stringify(locale)).not.toContain("/zh-HK");
    expect(provenanceErrors(wisetechIntegrationProvenance)).toEqual([]);
  });

  it("maps every frozen donor sitemap row exactly once with its evidence ID and unchanged reconciliation", () => {
    expect(donorRouteContractErrors(wisetechIntegrationManifest)).toEqual([]);
    expect(wisetechIntegrationManifest.filter(({sourceEvidenceId}) => sourceEvidenceId !== undefined)).toHaveLength(67);
    expect(wisetechIntegrationManifest.filter(({sourceEvidenceId}) => sourceEvidenceId !== undefined).map(({sourceEvidenceId}) => sourceEvidenceId).sort()).toEqual(
      authoritativeSourceInventory.sitemapRoutes.map(({id}) => id).sort(),
    );
  });

  it("adds only historical evidence for the six reconciled donor aliases", () => {
    const bySource = new Map(wisetechIntegrationManifest.map((item) => [item.source, item]));
    expect(bySource.get("/events/asia-smart-innovation-awards-summit-2025")).toMatchObject({kind: "route", canonicalPath: "/events/[slug]", disposition: "merge", sourceEvidenceId: "sitemap-18"});
    expect(bySource.get("/events/smart-innovation-meets-genai")).toMatchObject({kind: "route", canonicalPath: "/events/[slug]", disposition: "merge", sourceEvidenceId: "sitemap-19"});
    expect(bySource.get("/programmes/tech-connect")).toMatchObject({kind: "route", canonicalPath: "/programs/tct", disposition: "merge", sourceEvidenceId: "sitemap-30"});
    expect(bySource.get("/programmes/asia-smart-innovation-awards")).toMatchObject({kind: "route", canonicalPath: "/programs/asa", disposition: "merge", sourceEvidenceId: "sitemap-31"});
    expect(bySource.get("/programmes/asia-smart-innovation-awards/2025")).toMatchObject({kind: "route", canonicalPath: "/programs/asa", disposition: "merge", sourceEvidenceId: "sitemap-32"});
    expect(bySource.get("/programmes/hkict-startup-award")).toMatchObject({kind: "route", canonicalPath: "/programs/hkict", disposition: "merge", sourceEvidenceId: "sitemap-33"});
    expect(bySource.get("/events/asia-smart-innovation-awards-summit-2025")?.rationale.toLowerCase()).toContain("historical");
    expect(bySource.get("/programmes/asia-smart-innovation-awards/2025")?.rationale).toContain("edition");
  });

  it("deep-freezes the manifest and nested contract arrays", () => {
    expect(Object.isFrozen(wisetechIntegrationManifest)).toBe(true);
    for (const item of wisetechIntegrationManifest) {
      expect(Object.isFrozen(item), item.id).toBe(true);
      if (item.destinationChain) expect(Object.isFrozen(item.destinationChain), item.id).toBe(true);
      if (item.durableOwners) expect(Object.isFrozen(item.durableOwners), item.id).toBe(true);
    }
    const join = wisetechIntegrationManifest.find(({id}) => id === "cta-join-wisetech")!;
    const original = [...join.destinationChain!];
    expect(() => (join.destinationChain as string[]).push("/contact")).toThrow(TypeError);
    expect(join.destinationChain).toEqual(original);
    expect(isDeeplyFrozen(wisetechIntegrationProvenance)).toBe(true);
    for (const entry of wisetechIntegrationManifest.filter(({sourceEvidenceId}) => sourceEvidenceId !== undefined)) {
      expect(typeof entry.sourceEvidenceId, entry.id).toBe("string");
    }
  });

  it("rejects hostile donor route disappearance, duplication, evidence drift, and route-contract drift", () => {
    const source = "/events/smart-innovation-meets-genai";
    const expected = wisetechIntegrationManifest.find(({source: value}) => value === source)!;
    const missing = wisetechIntegrationManifest.filter(({source: value}) => value !== source);
    const duplicate = [...wisetechIntegrationManifest, {...expected, id: "hostile-duplicate-donor-route"}];
    const wrongEvidence = wisetechIntegrationManifest.map((item) => item === expected ? {...item, sourceEvidenceId: "sitemap-01"} : item);
    const wrongContract = wisetechIntegrationManifest.map((item) => item === expected ? {...item, disposition: "retire" as const, canonicalPath: null} : item);
    expect(donorRouteContractErrors(missing)).toContainEqual({code: "missing-donor-route", sourcePath: source});
    expect(donorRouteContractErrors(duplicate)).toContainEqual({code: "duplicate-donor-route", sourcePath: source});
    expect(donorRouteContractErrors(wrongEvidence)).toContainEqual({code: "wrong-source-evidence", sourcePath: source});
    expect(donorRouteContractErrors(wrongContract)).toContainEqual({code: "wrong-route-contract", sourcePath: source});
  });

  it("rejects hostile provenance continuity and replacement of the historical archive SHA", () => {
    const continuity = structuredClone(wisetechIntegrationProvenance) as unknown as {
      authoritativeDonor: {continuityWithReportedArchive: boolean};
      reportedArchiveIdentity: {archiveSha256: string; commit: string};
    };
    continuity.authoritativeDonor.continuityWithReportedArchive = true;
    const replacedArchiveSha = structuredClone(wisetechIntegrationProvenance) as unknown as {
      authoritativeDonor: {tree: string};
      reportedArchiveIdentity: {archiveSha256: string; commit: string};
    };
    replacedArchiveSha.reportedArchiveIdentity.archiveSha256 = replacedArchiveSha.authoritativeDonor.tree;
    const collapsed = structuredClone(wisetechIntegrationProvenance) as unknown as {
      authoritativeDonor: {commit: string};
      reportedArchiveIdentity: {archiveSha256: string; commit: string};
    };
    collapsed.reportedArchiveIdentity.commit = collapsed.authoritativeDonor.commit;
    expect(provenanceErrors(continuity as typeof wisetechIntegrationProvenance)).toContain("false-archive-continuity");
    expect(provenanceErrors(replacedArchiveSha as typeof wisetechIntegrationProvenance)).toContain("archive-sha-replaced-with-git-identity");
    expect(provenanceErrors(collapsed as typeof wisetechIntegrationProvenance)).toContain("reported-archive-drift");
  });

  it("validates every non-retired destination against the repository", async () => {
    expect(validateRouteParity(wisetechIntegrationManifest, await validationDestinations())).toEqual([]);
  });

  it("validates canonicalPath independently from a valid destination chain", async () => {
    const base = wisetechIntegrationManifest.find(({id}) => id === "cta-find-event")!;
    const hostile = withIdentity(
      base,
      "hostile-invalid-canonical-valid-chain",
      "cta:hostile-invalid-canonical-valid-chain",
      {canonicalPath: "/missing-canonical", destinationChain: ["/events"]},
    );

    expect(validateRouteParity([hostile], await validationDestinations())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({entryId: hostile.id, code: "unresolved-destination"}),
      ]),
    );
  });

  it("rejects empty and canonical-inconsistent destination chains", async () => {
    const base = wisetechIntegrationManifest.find(({id}) => id === "cta-find-event")!;
    const empty = withIdentity(base, "hostile-empty-chain", "cta:hostile-empty-chain", {destinationChain: []});
    const wrongFirst = withIdentity(
      base,
      "hostile-wrong-first-chain-step",
      "cta:hostile-wrong-first-chain-step",
      {destinationChain: ["/launchpad", "/events"]},
    );
    const destinations = await validationDestinations();
    for (const item of [empty, wrongFirst]) {
      expect(validateRouteParity([item], destinations)).toEqual([
        expect.objectContaining({entryId: item.id, code: "invalid-destination-chain"}),
      ]);
    }
  });

  it("rejects every destination chain on a retired entry", async () => {
    const retired = wisetechIntegrationManifest.find(({disposition}) => disposition === "retire")!;
    const hostile = withIdentity(
      retired,
      "hostile-retired-with-chain",
      "/hostile-retired-with-chain",
      {destinationChain: ["/about"]},
    );

    expect(validateRouteParity([hostile], await validationDestinations())).toEqual([
      expect.objectContaining({entryId: hostile.id, code: "invalid-destination-chain"}),
    ]);
  });

  it("treats only repository patterns as directional wildcards", async () => {
    const hostile = withIdentity(
      wisetechIntegrationManifest[0]!,
      "hostile-submitted-dynamic-pattern",
      "/hostile-submitted-dynamic-pattern",
      {canonicalPath: "/[slug]", disposition: "merge"},
    );
    const destinations = {
      ...(await validationDestinations()),
      appRoutes: new Set(["/about"]),
      redirects: new Map<string, string>(),
      conciergeActions: new Set<string>(),
    };
    expect(validateRouteParity([hostile], destinations)).toEqual([
      expect.objectContaining({entryId: hostile.id, code: "unresolved-destination"}),
    ]);
  });

  it("requires redirect sources and targets to match next.config", async () => {
    const base = wisetechIntegrationManifest.find(({disposition}) => disposition === "redirect")!;
    const fabricated = withIdentity(
      base, "hostile-fabricated-redirect", "/fabricated-redirect-source", {canonicalPath: "/about"},
    );
    const wrongTarget = withIdentity(
      base, "hostile-wrong-redirect-target", "/projects", {canonicalPath: "/about"},
    );
    const destinations = await validationDestinations();
    for (const item of [fabricated, wrongTarget]) {
      expect(validateRouteParity([item], destinations)).toEqual([
        expect.objectContaining({entryId: item.id, code: "invalid-redirect"}),
      ]);
    }
  });

  it("rejects unsupported or mismatched register-interest outcomes", async () => {
    const base = wisetechIntegrationManifest.find(({id}) => id === "cta-register-interest")!;
    const unsupportedOwner = withIdentity(
      base,
      "hostile-unsupported-interest-owner",
      "cta:register-interest",
      {durableOwners: ["events", "cohorts", "crm-inquiry"] as never},
    );
    const mismatchedAction = withIdentity(
      base,
      "hostile-mismatched-interest-action",
      "cta:register-interest",
      {destinationChain: ["/events", "/showcase"]},
    );
    const destinations = await validationDestinations();
    expect(validateRouteParity([unsupportedOwner], destinations)).toEqual([
      expect.objectContaining({entryId: unsupportedOwner.id, code: "invalid-durable-owner"}),
    ]);
    expect(validateRouteParity([mismatchedAction], destinations)).toEqual([
      expect.objectContaining({entryId: mismatchedAction.id, code: "invalid-durable-outcome"}),
    ]);
  });

  it("detects unmapped routes and nonexistent CTA destinations", async () => {
    const destinations = await validationDestinations();
    const routeHostile = withIdentity(
      wisetechIntegrationManifest[0]!,
      "hostile-unmapped-route",
      "/hostile-unmapped-route",
      {canonicalPath: "/route-that-does-not-exist", disposition: "merge"},
    );
    const ctaHostile = withIdentity(
      wisetechIntegrationManifest.find(({kind}) => kind === "cta")!,
      "hostile-missing-cta",
      "cta:hostile-missing-destination",
      {
        canonicalPath: "/cta-destination-that-does-not-exist",
        destinationChain: ["/cta-destination-that-does-not-exist"],
      },
    );
    for (const item of [routeHostile, ctaHostile]) {
      expect(validateRouteParity([item], destinations)).toEqual([
        expect.objectContaining({entryId: item.id, code: "unresolved-destination"}),
      ]);
    }
  });

  it("rejects duplicate identity, missing fields and invalid retire destinations", async () => {
    const valid = wisetechIntegrationManifest[0]!;
    const duplicate = {...valid};
    const missing = withIdentity(
      valid, "hostile-missing-owner", "/hostile-missing-owner", {dataOwner: ""},
    );
    const retired = withIdentity(
      valid,
      "hostile-retired-with-destination",
      "/hostile-retired-with-destination",
      {disposition: "retire", canonicalPath: "/about"},
    );
    const errors = validateRouteParity(
      [valid, duplicate, missing, retired],
      await validationDestinations(),
    );
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({entryId: valid.id, code: "duplicate-id"}),
      expect.objectContaining({entryId: valid.id, code: "duplicate-source"}),
      expect.objectContaining({entryId: missing.id, code: "missing-field"}),
      expect.objectContaining({entryId: retired.id, code: "invalid-destination"}),
    ]));
  });
});
