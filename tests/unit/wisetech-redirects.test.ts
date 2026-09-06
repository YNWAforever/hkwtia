import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";
import {publicRoutes} from "@/config/public-routes";
import {authoritativeSourceInventory} from "@/config/wisetech-authoritative-source-inventory";
import {wisetechDesignRedirects} from "@/config/wisetech-redirects";

const explicitSources = ["/projects", "/history", "/members", "/members/:id"];
const rules = wisetechDesignRedirects(explicitSources);
const bySource = new Map(rules.map((rule) => [rule.source, rule]));
const toPattern = (path: string) => path.replace(/\[([^/\]]+)\]/g, ":$1");

// Dispatcher rows whose source already IS the canonical page (identity) or whose source is
// covered by a pre-existing explicit rule (design D-8). Everything else that is `merge` must
// produce a rule.
const identityDispatcher = new Set([
  "/events/[slug]", "/portal/profile", "/portal/company", "/portal/directory",
  "/portal/events", "/portal/documents", "/portal/billing",
]);
const explicitCollision = new Set(["/members/[slug]"]);

describe("wisetechDesignRedirects", () => {
  it("covers all 51 merge donor sitemap routes, three sources each", () => {
    const merges = authoritativeSourceInventory.sitemapRoutes.filter(({disposition}) => disposition === "merge");
    expect(merges).toHaveLength(51);
    for (const row of merges) {
      const source = toPattern(row.sourcePath);
      for (const prefix of ["", "/en", "/zh"]) {
        expect(bySource.has(`${prefix}${source}`), `${prefix}${source}`).toBe(true);
      }
    }
  });

  it("covers every merge dispatcher pattern except identities and explicit collisions", () => {
    const merges = authoritativeSourceInventory.dispatcherOnlyRoutes.filter(({disposition}) => disposition === "merge");
    expect(merges.length).toBeGreaterThan(0);
    for (const row of merges) {
      const source = toPattern(row.sourcePath);
      const expected = !identityDispatcher.has(row.sourcePath) && !explicitCollision.has(row.sourcePath);
      expect(bySource.has(source), row.sourcePath).toBe(expected);
    }
    expect(bySource.get("/join/success")?.destination).toBe("/join/complete");
    expect(bySource.get("/portal/seats")?.destination).toBe("/portal/company/seats");
    expect(bySource.get("/portal/solution")?.destination).toBe("/portal/company/listing");
    expect(bySource.get("/solutions/:slug")?.destination).toBe("/showcase/:slug");
    expect(bySource.get("/insights/:slug")?.destination).toBe("/news/:slug");
    expect(bySource.get("/programmes/hkict")?.destination).toBe("/programs/hkict");
  });

  it("targets the canonical's static prefix when the source cannot supply a param (D-7)", () => {
    expect(bySource.get("/request-introduction")?.destination).toBe("/showcase");
    expect(bySource.get("/events/asia-smart-innovation-awards-summit-2025")?.destination).toBe("/events");
    expect(bySource.get("/zh/events/smart-innovation-meets-genai")?.destination).toBe("/zh/events");
  });

  it("prefixes the zh destination and leaves the en destination unprefixed (D-6)", () => {
    expect(bySource.get("/why-wisetech")?.destination).toBe("/about");
    expect(bySource.get("/en/why-wisetech")?.destination).toBe("/about");
    expect(bySource.get("/zh/why-wisetech")?.destination).toBe("/zh/about");
    expect(bySource.get("/zh/members/:slug")).toBeUndefined();
  });

  it("is temporary, self-free, sorted and frozen", () => {
    for (const rule of rules) {
      expect(rule.permanent, rule.source).toBe(false);
      expect(rule.source, rule.source).not.toBe(rule.destination);
    }
    expect(rules.map(({source}) => source)).toEqual([...rules.map(({source}) => source)].sort((a, b) => a.localeCompare(b)));
    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules.every((rule) => Object.isFrozen(rule))).toBe(true);
  });

  it("never shadows a live public route or a classified legacy url", () => {
    const legacySources = new Set(legacyUrls.entries.map(({from}) => (from.length > 1 && from.endsWith("/") ? from.slice(0, -1) : from)));
    for (const rule of rules) {
      expect(publicRoutes, rule.source).not.toContain(rule.source);
      expect(legacySources.has(rule.source), rule.source).toBe(false);
    }
  });

  it("is spread into next.config after the explicit rules and before the legacy rules", async () => {
    const configured = ((await nextConfig.redirects?.()) ?? []) as {source: string; destination: string; permanent: boolean}[];
    const sources = configured.map(({source}) => source);
    const firstGenerated = sources.indexOf(rules[0]!.source);
    const lastExplicit = Math.max(...explicitSources.map((source) => sources.indexOf(source)));
    const firstLegacy = sources.indexOf("/event/:path*");
    expect(firstGenerated).toBeGreaterThan(lastExplicit);
    expect(firstGenerated).toBeLessThan(firstLegacy);
    expect(configured.find(({source}) => source === "/zh/about/leadership")).toEqual({source: "/zh/about/leadership", destination: "/zh/about/chairman", permanent: false});
  });
});
