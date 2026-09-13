import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";
import {publicRoutes} from "@/config/public-routes";
import {wisetechDesignRedirects} from "@/config/wisetech-redirects";
// Next bundles its own path-to-regexp fork and uses it internally to compile
// `redirects()` `source` patterns into matchers (see next/dist/shared/lib/router
// /utils/prepare-destination.js). Importing it here means "covered by some rule"
// is checked with the same matching engine Next.js uses at request time, not a
// hand-rolled reimplementation of it that could quietly drift from the real thing.
// It ships no type declarations — it's an internal compiled dependency, not a
// public API — so the import is untyped at the boundary and cast immediately
// below to the one signature this file relies on.
// @ts-expect-error -- next/dist/compiled/path-to-regexp has no .d.ts to import against
const {pathToRegexp} = (await import("next/dist/compiled/path-to-regexp")) as unknown as {
  pathToRegexp: (path: string) => RegExp;
};

async function getRedirects() {
  return ((await nextConfig.redirects?.()) ?? []) as {
    source: string;
    destination: string;
    permanent?: boolean;
    has?: {type: string; value: string}[];
  }[];
}

describe("legacy redirects", () => {
  it("resolves every classified legacy url the way Next.js actually processes a request", async () => {
    const redirects = await getRedirects();
    const matchers = redirects.map((redirect) => pathToRegexp(redirect.source));
    const realRoutes = new Set<string>(publicRoutes);

    for (const entry of legacyUrls.entries) {
      // Next 308s the trailing slash away before it consults redirects(), so
      // the stripped path is what the rules actually see. Testing the raw
      // captured path instead would pass against rules that never fire — which
      // is exactly how every `equivalent` mapping came to 404 in production
      // while this suite stayed green.
      const normalized = entry.from.length > 1 && entry.from.endsWith("/")
        ? entry.from.slice(0, -1)
        : entry.from;
      // Two ways to be reachable: a rule matches, or the normalised path is
      // already a live page (`/news/` and `/events/` kept their names, so they
      // need no rule and must not have one).
      const reachable = matchers.some((matcher) => matcher.test(normalized))
        || realRoutes.has(normalized);
      expect(reachable, `${entry.from} (normalised to ${normalized}) reaches nothing`).toBe(true);
    }
  });

  // Two, not four: Phase B2 (D-11) removed the temporary `/members` and `/members/:id` 307s
  // to `/showcase` because both paths are real reviewed member pages now, and a redirect would
  // shadow every one of them.
  it("keeps the two pre-existing redirects and no /members rule", async () => {
    const redirects = await getRedirects();
    const sources = redirects.map(({source}) => source);

    expect(sources).toEqual(expect.arrayContaining(["/projects", "/history"]));
    expect(sources).not.toContain("/members");
    expect(sources).not.toContain("/members/:id");
  });

  it("makes every legacy rule permanent so link equity transfers", async () => {
    const redirects = await getRedirects();
    const preExisting = new Set(["/projects", "/history"]);
    const preExistingRules = [
      {source: "/projects", destination: "/programs/asa"},
      {source: "/history", destination: "/about"},
    ];
    // WiseTech design paths are 307s by design (config/wisetech-redirects.ts, D-5); only the
    // hkwtia.org legacy urls carry link equity worth a 308.
    const generated = new Set(wisetechDesignRedirects(preExistingRules).map(({source}) => source));
    const legacyRules = redirects.filter(({source}) => !preExisting.has(source) && !generated.has(source));

    // Sanity check that the filter above actually found the legacy rules and
    // isn't vacuously passing over an empty array.
    expect(legacyRules.length).toBeGreaterThan(0);

    for (const redirect of legacyRules) {
      expect(redirect.permanent, redirect.source).toBe(true);
    }
  });

  // The trap this guards against: a source that resolves to itself would be
  // an infinite redirect. "/" -> "/" is the concrete case (see the home-page
  // exclusion in content/legacy-urls.json); this checks every rule generally.
  it("produces no self-redirect", async () => {
    const redirects = await getRedirects();
    for (const redirect of redirects) {
      expect(redirect.source, JSON.stringify(redirect)).not.toBe(redirect.destination);
    }
  });

  it("does not shadow the live app's real /events/[slug] route with a wildcard", async () => {
    const redirects = await getRedirects();
    const matchers = redirects.map((redirect) => pathToRegexp(redirect.source));

    for (const liveSlug of ["/events/some-real-upcoming-event", "/events/another-event-2027"]) {
      const shadowed = matchers.some((matcher) => matcher.test(liveSlug));
      expect(shadowed, `${liveSlug} should reach the live app, not a legacy redirect`).toBe(false);
    }
  });

  // The vercel.app -> hkwtia.org redirect must not fire before DNS moves, or it sends every
  // visitor to a WordPress site that no longer expects them, with no way back except a deploy.
  // `redirects()` reads NEXT_PUBLIC_SITE_URL at call time, so this drives the real gate rather
  // than asserting on the source text.
  it("keeps the vercel.app redirect inert until the site url says the cutover happened", async () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    const hostRuleOn = (redirects: Awaited<ReturnType<typeof getRedirects>>) =>
      redirects.find((redirect) => redirect.has?.some((condition) => condition.type === "host" && condition.value === "hkwtia.vercel.app"));

    try {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      expect(hostRuleOn(await getRedirects())).toBeUndefined();

      // Anything that does not name hkwtia.org leaves it inert too -- a typo must not arm it.
      process.env.NEXT_PUBLIC_SITE_URL = "https://staging.example";
      expect(hostRuleOn(await getRedirects())).toBeUndefined();

      process.env.NEXT_PUBLIC_SITE_URL = "https://hkwtia.org";
      const armed = hostRuleOn(await getRedirects());
      expect(armed).toBeDefined();
      expect(armed!.destination).toBe("https://hkwtia.org/:path*");
      expect(armed!.permanent).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});
