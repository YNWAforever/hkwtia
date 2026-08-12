import {describe, expect, it} from "vitest";

import {capturePages, collectPageUrls, parseSitemapUrls, retryable} from "@/scripts/capture-legacy-site";

describe("legacy site capture", () => {
  it("extracts loc entries from a WordPress sitemap", () => {
    const xml = `<?xml version="1.0"?>
      <urlset><url><loc>https://hkwtia.org/about-us/</loc></url>
      <url><loc>https://hkwtia.org/2022/10/anniversary/</loc></url></urlset>`;

    expect(parseSitemapUrls(xml)).toEqual([
      "https://hkwtia.org/about-us/",
      "https://hkwtia.org/2022/10/anniversary/",
    ]);
  });

  it("ignores a sitemap index that lists no page urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });

  // The old site 520s intermittently, so a single failed fetch must not end the
  // capture — this is the whole reason the script exists rather than a curl loop.
  it("retries a failing fetch before giving up", async () => {
    let calls = 0;
    const result = await retryable(async () => {
      calls += 1;
      if (calls < 3) throw new Error("520");
      return "ok";
    }, {attempts: 3, delayMs: 0});

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("returns null rather than throwing when every attempt fails", async () => {
    const result = await retryable(async () => {
      throw new Error("520");
    }, {attempts: 2, delayMs: 0});

    expect(result).toBeNull();
  });

  // sitemap_index.xml only lists *other* sitemaps, so a capture that doesn't follow
  // .xml locs one level deeper silently drops every post type WordPress splits out
  // (events, FAQs, categories) — this is what caught the missing tribe_events pages.
  it("follows nested sitemaps without revisiting one it has already read", async () => {
    const seen: string[] = [];
    const fetchStub = async (url: string) => {
      seen.push(url);
      if (url.endsWith("index.xml")) {
        return `<urlset><loc>https://x.test/nested.xml</loc></urlset>`;
      }
      if (url.endsWith("nested.xml")) {
        // points back at the index; must not loop
        return `<urlset><loc>https://x.test/index.xml</loc><loc>https://x.test/page/</loc></urlset>`;
      }
      return "<html></html>";
    };

    const urls = await collectPageUrls(["https://x.test/index.xml"], fetchStub);

    expect(urls).toEqual(["https://x.test/page/"]);
    expect(seen.filter((u) => u.endsWith("index.xml"))).toHaveLength(1);
  });

  // inventory.json feeds Task 8's redirect map. A url that exhausts retries must not
  // also appear in capturedUrls, or Task 8 would treat a page nobody ever fetched as
  // successfully captured.
  it("keeps a failed page out of capturedUrls and puts it in missed", async () => {
    const fetchStub = async (url: string) => (url.includes("fail") ? null : "<html></html>");

    const result = await capturePages(["https://x.test/ok/", "https://x.test/fail/"], fetchStub, () => {});

    expect(result.captured).toEqual(["https://x.test/ok/"]);
    expect(result.missed).toEqual(["https://x.test/fail/"]);
  });
});
