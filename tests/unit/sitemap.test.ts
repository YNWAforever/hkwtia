import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);

import sitemap from "@/app/sitemap";

describe("published build logs in the sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds both localized URLs for each published build-log slug", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([
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
});
