import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
}));
const showcase = vi.hoisted(() => ({
  listPublishedSlugs: vi.fn(),
}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("@/content/news", () => ({
  newsPosts: [{
    slug: "static-update",
    publishedAt: "2026-07-01T00:00:00.000Z",
    image: "/images/projects-hero.jpg",
    namespace: "news.staticUpdate",
  }],
}));

import sitemap from "@/app/sitemap";

describe("published build logs in the sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showcase.listPublishedSlugs.mockResolvedValue([]);
  });

  it("adds both localized URLs for each published build-log slug", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([
      {
        slug: "static-update",
        titleEn: "Unreachable database title",
        titleZh: "不可到達的資料庫標題",
        publishedAt: new Date("2026-07-29T05:00:00.000Z"),
        author: "HKWTIA Engineering",
      },
      {
        slug: "m4-ai-ops-dashboard",
        titleEn: "AI-Ops dashboard",
        titleZh: "AI 營運儀表板",
        publishedAt: new Date("2026-07-29T04:00:00.000Z"),
        author: "HKWTIA Engineering",
      },
    ]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/news/m4-ai-ops-dashboard",
      "http://localhost:3000/zh/news/m4-ai-ops-dashboard",
    ]));
    expect(
      urls.filter((url) => url === "http://localhost:3000/news/static-update"),
    ).toHaveLength(1);
    expect(
      urls.filter(
        (url) => url === "http://localhost:3000/zh/news/static-update",
      ),
    ).toHaveLength(1);
  });

  it("keeps static sitemap entries when only the public-post read fails", async () => {
    publicPosts.listPublishedBuildLogs.mockRejectedValue(
      new Error("TRANSIENT_DATABASE_READ"),
    );

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/",
      "http://localhost:3000/zh",
      "http://localhost:3000/news",
      "http://localhost:3000/zh/news",
    ]));
  });

  it("adds both localized URLs for each published showcase slug", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue(["harbour-vision-ai"]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/showcase/harbour-vision-ai",
      "http://localhost:3000/zh/showcase/harbour-vision-ai",
    ]));
  });

  it("keeps static sitemap entries when showcase reads fail", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/",
      "http://localhost:3000/zh",
    ]));
  });
});
