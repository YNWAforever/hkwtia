import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";
import {authoritativeSourceInventory} from "@/config/wisetech-authoritative-source-inventory";
import {wisetechIntegrationManifest} from "@/config/wisetech-integration-manifest";
import {wisetechDesignRedirects} from "@/config/wisetech-redirects";
import {routing} from "@/i18n/routing";
import {listAppRoutes} from "@/tests/helpers/app-routes";

const explicitRules = [
  {source: "/projects", destination: "/programs/asa"},
  {source: "/history", destination: "/about"},
  {source: "/members", destination: "/showcase"},
  {source: "/members/:id", destination: "/showcase"},
];
const rules = wisetechDesignRedirects(explicitRules);
const bySource = new Map(rules.map((rule) => [rule.source, rule]));
const toPattern = (path: string) => path.replace(/\[([^/\]]+)\]/g, ":$1");

// Dispatcher rows whose source already IS the canonical page (identity) or whose bare source is
// covered by a pre-existing explicit rule (design D-8, per variant). Everything else that is
// `merge` must produce a rule.
const identityDispatcher = new Set([
  "/events/[slug]", "/portal/profile", "/portal/company", "/portal/directory",
  "/portal/events", "/portal/documents", "/portal/billing",
]);
const explicitCollision = new Set(["/members/[slug]"]);

// D-7: the donor's two historical event pages have no hkwtia counterpart, so their sources are
// cut back to `/events`. That makes each generated rule shadow the live `/events/[slug]` page
// for exactly that slug: an hkwtia event published under either slug would be unreachable.
// Adding a source here is a deliberate decision to reserve that slug, never a way to make the
// inventory check pass.
const KNOWN_DYNAMIC_ROUTE_SHADOWS = [
  "/events/asia-smart-innovation-awards-summit-2025",
  "/events/smart-innovation-meets-genai",
] as const;

/**
 * `[x]` in a route matches any single non-empty segment; `:param` in a source matches both a
 * dynamic route segment (`[x]`) and any static one — in Next, a redirect source `/about/:slug`
 * also matches the static page `/about/chairman`, so a `:param` source shadows every route
 * segment at that position, not just a dynamic one.
 */
function shadows(source: string, route: string): boolean {
  const sourceSegments = source.split("/");
  const routeSegments = route.split("/");
  if (sourceSegments.length !== routeSegments.length) return false;
  return sourceSegments.every((segment, index) => {
    const routeSegment = routeSegments[index]!;
    const dynamicRoute = routeSegment.startsWith("[") && routeSegment.endsWith("]");
    if (dynamicRoute) return segment !== "";
    return segment.startsWith(":") || segment === routeSegment;
  });
}

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
  });

  it("yields to an explicit rule, including its destination, for the variant it covers (D-8)", () => {
    // `/members/:id` -> `/showcase` is explicit in next.config and owns the bare shape, so the
    // generator skips its own bare variant entirely (Next already has it). The locale-prefixed
    // donor urls still need a rule — the proxy would otherwise rewrite `/zh/members/<slug>` to a
    // missing page — but they must carry the explicit rule's own destination (`/showcase`), not
    // the manifest's `/showcase/:slug`, since that is what the bare url actually resolves to.
    expect(bySource.get("/members/:id")).toBeUndefined();
    expect(bySource.get("/members/:slug")).toBeUndefined();
    expect(bySource.get("/en/members/:id")?.destination).toBe("/showcase");
    expect(bySource.get("/zh/members/:id")?.destination).toBe("/zh/showcase");
  });

  it("is temporary, self-free, sorted and frozen", () => {
    for (const rule of rules) {
      expect(rule.permanent, rule.source).toBe(false);
      expect(rule.source, rule.source).not.toBe(rule.destination);
    }
    const sources = rules.map(({source}) => source);
    expect(sources).toEqual([...sources].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules.every((rule) => Object.isFrozen(rule))).toBe(true);
  });

  it("shadows no real page except the two reserved donor event slugs", () => {
    const appRoutes = listAppRoutes();
    expect(appRoutes).toContain("/events/[slug]");
    const bareSources = rules.map(({source}) => source).filter((source) => !/^\/(en|zh)(\/|$)/.test(source));
    const shadowing = bareSources.filter((source) => appRoutes.some((route) => shadows(source, route)));
    expect([...shadowing].sort()).toEqual([...KNOWN_DYNAMIC_ROUTE_SHADOWS].sort());
  });

  it("never shadows a classified legacy url", () => {
    const legacySources = new Set(legacyUrls.entries.map(({from}) => (from.length > 1 && from.endsWith("/") ? from.slice(0, -1) : from)));
    for (const rule of rules) {
      expect(legacySources.has(rule.source), rule.source).toBe(false);
    }
  });

  it("throws for a merge without a canonical path or with a non-path source", () => {
    const broken = wisetechIntegrationManifest.find(({id}) => id === "route-source-event-smart-innovation-meets-genai")!;
    expect(() => wisetechDesignRedirects(explicitRules, [{...broken, canonicalPath: null}]))
      .toThrow("WISETECH_REDIRECT_MISSING_CANONICAL:route-source-event-smart-innovation-meets-genai");
    expect(() => wisetechDesignRedirects(explicitRules, [{...broken, source: "events/smart-innovation-meets-genai"}]))
      .toThrow("WISETECH_REDIRECT_INVALID_SOURCE:route-source-event-smart-innovation-meets-genai");
  });

  it("throws for a merge whose destination is not a same-site path", () => {
    // A protocol-relative or absolute destination would turn every generated rule into an open
    // redirect; the guard is symmetric with the source one and fails the build instead.
    const broken = wisetechIntegrationManifest.find(({id}) => id === "route-source-event-smart-innovation-meets-genai")!;
    expect(() => wisetechDesignRedirects(explicitRules, [{...broken, canonicalPath: "//evil.example"}]))
      .toThrow("WISETECH_REDIRECT_INVALID_DESTINATION:route-source-event-smart-innovation-meets-genai");
    expect(() => wisetechDesignRedirects(explicitRules, [{...broken, canonicalPath: "https://evil.example"}]))
      .toThrow("WISETECH_REDIRECT_INVALID_DESTINATION:route-source-event-smart-innovation-meets-genai");
  });

  it("matches the proxy's locale prefixes", () => {
    // The generator hard-codes `/en` (stripped) and `/zh` (kept) as its source prefixes; this
    // pins those to the next-intl routing config so a prefix change cannot silently orphan them.
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toEqual(expect.objectContaining({mode: "as-needed", prefixes: {"zh-HK": "/zh"}}));
    // A third locale would be silently orphaned by the generator's hard-coded `/en`/`/zh`
    // prefixes: `localePrefixes` above has no entry for it, so its donor urls would 404.
    expect(routing.locales).toEqual(["en", "zh-HK"]);
  });

  it("is spread into next.config after the explicit rules and before the legacy rules", async () => {
    const configured = ((await nextConfig.redirects?.()) ?? []) as {source: string; destination: string; permanent: boolean}[];
    const sources = configured.map(({source}) => source);
    const firstGenerated = sources.indexOf(rules[0]!.source);
    const lastExplicit = Math.max(...explicitRules.map(({source}) => sources.indexOf(source)));
    const firstLegacy = sources.indexOf("/event/:path*");
    expect(firstGenerated).toBeGreaterThan(lastExplicit);
    expect(firstGenerated).toBeLessThan(firstLegacy);
    expect(configured.find(({source}) => source === "/zh/about/leadership")).toEqual({source: "/zh/about/leadership", destination: "/zh/about/chairman", permanent: false});
  });
});
