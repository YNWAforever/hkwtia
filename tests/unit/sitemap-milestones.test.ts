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
import {featuredOnly, milestonesOnly} from "@/lib/history/milestones";

/**
 * The featured milestones were given their own URLs so 25 years of inbound
 * links have somewhere specific to land. A page absent from the sitemap is a
 * page search engines have to stumble into, which defeats the reason it exists.
 */
describe("milestone detail pages in the sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.listPublishedNews.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
  });

  it("lists every featured milestone in both locales", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const featured = featuredOnly(milestonesOnly(milestones));

    expect(featured.length).toBeGreaterThan(0);
    for (const {slug} of featured) {
      expect(urls, slug).toContain(`http://localhost:3000/about/history/${slug}`);
      expect(urls, slug).toContain(`http://localhost:3000/zh/about/history/${slug}`);
    }
  });

  // A non-featured milestone has no page of its own — it renders inline on the
  // timeline — so advertising a URL for it would list a 404.
  it("lists no url for a milestone without its own page", async () => {
    const urls = new Set((await sitemap()).map((entry) => entry.url));
    const unfeatured = milestonesOnly(milestones).filter(({featured}) => !featured);

    expect(unfeatured.length).toBeGreaterThan(0);
    for (const {slug} of unfeatured) {
      expect(urls.has(`http://localhost:3000/about/history/${slug}`), slug).toBe(false);
    }
  });
});
