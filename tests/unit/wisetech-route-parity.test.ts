import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import {
  evidenceKinds,
  integrationDispositions,
  integrationKinds,
  wisetechIntegrationManifest,
} from "@/config/wisetech-integration-manifest";
import type {IntegrationManifestEntry} from "@/config/wisetech-integration-manifest";
import {validateRouteParity} from "@/lib/integration/route-parity";

function pageFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.isFile() && entry.name === "page.tsx" ? [path] : [];
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
  pageFiles(resolve(process.cwd(), "app", "[locale]")).map(appRouteForPage),
);

async function validationDestinations() {
  const redirects = ((await nextConfig.redirects?.()) ?? []) as readonly {
    source: string;
    destination: string;
  }[];
  return {
    appRoutes,
    redirectSources: new Set(redirects.map(({source}) => source)),
    conciergeActions: new Set(["/api/ai/concierge"]),
  };
}

describe("WiseTech route parity manifest", () => {
  it("discovers the current App Router destination surface", () => {
    expect(appRoutes.size).toBeGreaterThanOrEqual(50);
    expect(appRoutes).toEqual(expect.objectContaining({
      has: expect.any(Function),
    }));
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
      "id",
      "kind",
      "source",
      "canonicalPath",
      "disposition",
      "dataOwner",
      "rationale",
      "evidence",
    ] as const;

    expect(wisetechIntegrationManifest.length).toBeGreaterThan(0);
    for (const entry of wisetechIntegrationManifest) {
      for (const field of requiredFields) expect(entry).toHaveProperty(field);
      expect(integrationKinds).toContain(entry.kind);
      expect(integrationDispositions).toContain(entry.disposition);
      expect(evidenceKinds).toContain(entry.evidence);
      expect(entry.id.trim(), `${entry.id}: id`).not.toBe("");
      expect(entry.source.trim(), `${entry.id}: source`).not.toBe("");
      expect(entry.dataOwner.trim(), `${entry.id}: dataOwner`).not.toBe("");
      expect(entry.rationale.trim(), `${entry.id}: rationale`).not.toBe("");
    }
  });

  it("keeps IDs and source route patterns unique and includes the canonical dynamic routes", () => {
    const ids = wisetechIntegrationManifest.map(({id}) => id);
    const sources = wisetechIntegrationManifest.map(({source}) => source);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sources).size).toBe(sources.length);

    const retainedRoutes = new Set(
      wisetechIntegrationManifest
        .filter(({kind}) => kind === "route")
        .map(({canonicalPath}) => canonicalPath),
    );
    for (const route of [
      "/unsubscribe",
      "/events/[slug]",
      "/news/[slug]",
      "/showcase/[slug]",
      "/about/history/[slug]",
    ]) {
      expect(retainedRoutes.has(route), route).toBe(true);
    }
  });

  it("maps the five Site CTA outcomes exactly onto existing durable journeys", () => {
    const byId = new Map(wisetechIntegrationManifest.map((entry) => [entry.id, entry]));
    expect(byId.get("cta-find-event")?.destinationChain).toEqual(["/events"]);
    expect(byId.get("cta-join-wisetech")?.destinationChain).toEqual([
      "/membership",
      "/join?plan=<canonical-plan>",
    ]);
    expect(byId.get("cta-explore-members-solutions")?.destinationChain).toEqual(["/showcase"]);
    expect(byId.get("cta-ask-wisetech")?.destinationChain).toEqual(["/api/ai/concierge"]);
    expect(byId.get("cta-register-interest")?.durableOwners).toEqual([
      "published-event",
      "published-cohort",
      "crm-inquiry",
    ]);
  });

  it("uses the existing next-intl switch without constructing a /zh-HK browser path", () => {
    const locale = wisetechIntegrationManifest.find(({id}) => id === "locale-language-toggle");
    expect(locale?.localeMechanism).toBe("next-intl-router-replace");
    expect(JSON.stringify(locale)).not.toContain("/zh-HK");
  });

  it("validates every non-retired destination against the repository", async () => {
    expect(validateRouteParity(
      wisetechIntegrationManifest,
      await validationDestinations(),
    )).toEqual([]);
  });

  it("detects unmapped routes and nonexistent CTA destinations", async () => {
    const destinations = await validationDestinations();
    const routeHostile: IntegrationManifestEntry = {
      ...wisetechIntegrationManifest[0]!,
      id: "hostile-unmapped-route",
      source: "/hostile-unmapped-route",
      canonicalPath: "/route-that-does-not-exist",
      disposition: "merge",
    };
    const ctaHostile: IntegrationManifestEntry = {
      ...wisetechIntegrationManifest.find(({kind}) => kind === "cta")!,
      id: "hostile-missing-cta",
      source: "cta:hostile-missing-destination",
      canonicalPath: "/cta-destination-that-does-not-exist",
      destinationChain: ["/cta-destination-that-does-not-exist"],
    };

    expect(validateRouteParity([routeHostile], destinations)).toEqual([
      expect.objectContaining({entryId: routeHostile.id, code: "unresolved-destination"}),
    ]);
    expect(validateRouteParity([ctaHostile], destinations)).toEqual([
      expect.objectContaining({entryId: ctaHostile.id, code: "unresolved-destination"}),
    ]);
  });

  it("rejects duplicate identity, missing fields and invalid retire destinations", async () => {
    const destinations = await validationDestinations();
    const valid = wisetechIntegrationManifest[0]!;
    const duplicate = {...valid};
    const missing = {
      ...valid,
      id: "hostile-missing-owner",
      source: "/hostile-missing-owner",
      dataOwner: "",
    };
    const retiredWithDestination: IntegrationManifestEntry = {
      ...valid,
      id: "hostile-retired-with-destination",
      source: "/hostile-retired-with-destination",
      disposition: "retire",
      canonicalPath: "/about",
    };

    const errors = validateRouteParity(
      [valid, duplicate, missing, retiredWithDestination] as readonly IntegrationManifestEntry[],
      destinations,
    );
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({entryId: valid.id, code: "duplicate-id"}),
      expect.objectContaining({entryId: valid.id, code: "duplicate-source"}),
      expect.objectContaining({entryId: missing.id, code: "missing-field"}),
      expect.objectContaining({entryId: retiredWithDestination.id, code: "invalid-destination"}),
    ]));
  });
});
