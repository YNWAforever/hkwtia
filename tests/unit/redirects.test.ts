import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";
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
  }[];
}

describe("legacy redirects", () => {
  it("serves every classified legacy url, matched the way Next.js actually matches sources", async () => {
    const redirects = await getRedirects();
    const matchers = redirects.map((redirect) => pathToRegexp(redirect.source));

    for (const entry of legacyUrls.entries) {
      const covered = matchers.some((matcher) => matcher.test(entry.from));
      expect(covered, `${entry.from} is not covered by any redirect rule`).toBe(true);
    }
  });

  it("keeps the four pre-existing redirects", async () => {
    const redirects = await getRedirects();
    const sources = redirects.map(({source}) => source);

    expect(sources).toEqual(
      expect.arrayContaining(["/projects", "/history", "/members", "/members/:id"]),
    );
  });

  it("makes every legacy rule permanent so link equity transfers", async () => {
    const redirects = await getRedirects();
    const preExisting = new Set(["/projects", "/history", "/members", "/members/:id"]);
    const legacyRules = redirects.filter(({source}) => !preExisting.has(source));

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
});
