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
import type {IntegrationManifestEntry} from "@/config/wisetech-integration-manifest";
import {validateRouteParity} from "@/lib/integration/route-parity";

function pageFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return pageFiles(path);
    return item.isFile() && item.name === "page.tsx" ? [path] : [];
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
  const configured = ((await nextConfig.redirects?.()) ?? []) as readonly {
    source: string;
    destination: string;
  }[];
  return {
    appRoutes,
    redirects: new Map(configured.map(({source, destination}) => [source, destination])),
    conciergeActions: new Set(["/api/ai/concierge"]),
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

  it("uses next-intl without claiming unavailable Site source evidence", () => {
    const locale = wisetechIntegrationManifest.find(({id}) => id === "locale-language-toggle");
    expect(locale?.localeMechanism).toBe("next-intl-router-replace");
    expect(JSON.stringify(locale)).not.toContain("/zh-HK");
    expect(wisetechIntegrationProvenance.site.archiveAvailable).toBe(false);
    expect(wisetechIntegrationManifest.filter(({evidence}) => evidence === "site-v13-source")).toEqual([]);
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

  it("treats only repository patterns as directional wildcards", () => {
    const hostile = withIdentity(
      wisetechIntegrationManifest[0]!,
      "hostile-submitted-dynamic-pattern",
      "/hostile-submitted-dynamic-pattern",
      {canonicalPath: "/[slug]", disposition: "merge"},
    );
    const destinations = {
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
