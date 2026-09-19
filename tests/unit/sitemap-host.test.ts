import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// The sitemap is a single async function awaiting every repository at once, so
// they are stubbed rather than reached: this test is about the HOST each entry is
// published on, not about which rows exist.
vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: {listPublishedSlugs: vi.fn(async () => [])}}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic: vi.fn(async () => [])}}));
vi.mock("@/lib/db/repos/public-posts", () => ({listPublishedBuildLogs: vi.fn(async () => []), listPublishedNews: vi.fn(async () => [])}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublishedSlugs: vi.fn(async () => [])}}));

import sitemap from "@/app/sitemap";
import {buildPageMetadata} from "@/lib/metadata";

const CUTOVER_HOST = "https://hkwtia.org";
const PREVIEW_HOST = "https://hkwtia-preview.vercel.app";

// `absoluteUrl` reads the variable at call time, so it is assigned per case and
// restored in `afterEach` even if an assertion throws -- an unrestored variable
// would leak into the metadata builders of every later test in the run.
const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

async function locs(): Promise<string[]> {
  return (await sitemap()).map((entry) => entry.url);
}

describe("the sitemap's host", () => {
  it("publishes every entry on the configured host once the cutover is done", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const urls = await locs();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${CUTOVER_HOST}/`)).toBe(true);
      expect(url).not.toContain("vercel.app");
      expect(url).not.toContain("localhost");
    }
  });

  it("never mentions hkwtia.org before the cutover has happened", async () => {
    // The counterpart of the redirect test's "a typo must not arm it": a sitemap
    // that published the real domain while DNS still pointed elsewhere would ask
    // crawlers to index a host that does not answer.
    process.env.NEXT_PUBLIC_SITE_URL = PREVIEW_HOST;
    const urls = await locs();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).not.toContain("hkwtia.org");
  });

  it("keeps the locale alternates on the same host as the entry they annotate", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const entries = await sitemap();
    const annotated = entries.filter((entry) => entry.alternates?.languages);
    expect(annotated.length).toBeGreaterThan(0);
    for (const entry of annotated) {
      const languages = entry.alternates!.languages as Record<string, string>;
      for (const value of Object.values(languages)) {
        expect(new URL(value).origin).toBe(CUTOVER_HOST);
      }
    }
  });

  it("agrees with the canonical a page publishes for the same route", async () => {
    // Both read NEXT_PUBLIC_SITE_URL today and nothing pinned that they agree;
    // a sitemap entry and a canonical pointing at different hosts is how a
    // cutover looks successful while quietly telling crawlers two things.
    process.env.NEXT_PUBLIC_SITE_URL = CUTOVER_HOST;
    const metadata = buildPageMetadata({locale: "en", pathname: "/events", title: "Events", description: "Events"});
    const canonical = new URL(String(metadata.alternates?.canonical));
    expect(canonical.origin).toBe(CUTOVER_HOST);
    const sitemapEntry = (await sitemap()).find((entry) => new URL(entry.url).pathname === "/events");
    expect(sitemapEntry).toBeDefined();
    expect(new URL(sitemapEntry!.url).origin).toBe(canonical.origin);
  });
});
