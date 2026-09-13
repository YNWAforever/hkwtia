import {readFileSync} from "node:fs";
import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
  listPublishedNews: vi.fn(),
}));
const showcase = vi.hoisted(() => ({listPublishedSlugs: vi.fn()}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));

import sitemap from "@/app/sitemap";
import {milestones} from "@/content/milestones";
import {milestonesOnly} from "@/lib/history/milestones";

/**
 * Every milestone now has its own page, so every one belongs in the sitemap. A page
 * absent from the sitemap is a page search engines have to stumble into; a sitemap entry
 * with no page is worse, because it publishes a url that 404s.
 */
describe("milestone detail pages in the sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.listPublishedNews.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
  });

  it("lists every milestone in both locales", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const all = milestonesOnly(milestones);

    // 51 milestones exist; only 6 were `featured`. The other 45 are real, bilingual,
    // 25-year association history rescued from the WordPress archive.
    expect(all.length).toBeGreaterThan(6);
    for (const {slug} of all) {
      expect(urls, slug).toContain(`http://localhost:3000/about/history/${slug}`);
      expect(urls, slug).toContain(`http://localhost:3000/zh/about/history/${slug}`);
    }
  });

  // Member stories redirect to /showcase and press releases to /news; neither is WTIA's
  // own institutional history, so neither gets a history detail page or a sitemap entry.
  it("lists no url for a member story or press release", async () => {
    const urls = new Set((await sitemap()).map((entry) => entry.url));
    const excluded = milestones.filter(({kind}) => kind !== "milestone");

    expect(excluded.length).toBeGreaterThan(0);
    for (const {slug} of excluded) {
      expect(urls.has(`http://localhost:3000/about/history/${slug}`), slug).toBe(false);
    }
  });

  it("keeps the sitemap and the route on the same filter", () => {
    // These drifting apart is the actual failure mode: filtering the sitemap more widely
    // than generateStaticParams publishes urls that 404, which is worse than omitting
    // them. Read as source so the coupling is asserted, not assumed.
    const route = readFileSync("app/[locale]/(public)/about/history/[slug]/page.tsx", "utf8");
    const sitemapSource = readFileSync("app/sitemap.ts", "utf8");

    const filterOf = (source: string) => (/featuredOnly\(milestonesOnly\(/.test(source) ? "featured" : "all");
    expect(filterOf(route)).toBe(filterOf(sitemapSource));
  });
});
