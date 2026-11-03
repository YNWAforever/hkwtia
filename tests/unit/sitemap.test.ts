import {readFileSync} from "node:fs";

import {beforeEach, describe, expect, it, vi} from "vitest";

import {fileMtime} from "@/lib/seo/sitemap-lastmod";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
  // The sitemap reads news as well as build logs. This mock omitted it, and the
  // omission stayed invisible while each read sat in its own try/catch: calling
  // an undefined export threw a TypeError that the catch swallowed as if it
  // were a failed database read.
  listPublishedNews: vi.fn(),
}));
const showcase = vi.hoisted(() => ({
  listPublishedSlugs: vi.fn(),
}));
const events = vi.hoisted(() => ({listPublicSlugs: vi.fn()}));
const companyProfiles = vi.hoisted(() => ({
  listPublishedSlugs: vi.fn(),
}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: companyProfiles}));
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
    publicPosts.listPublishedNews.mockResolvedValue([]);
    events.listPublicSlugs.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
    companyProfiles.listPublishedSlugs.mockResolvedValue([]);
  });

  it("does not add build-log slugs to the sitemap", async () => {
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

    expect(urls).not.toEqual(expect.arrayContaining([
      "http://localhost:3000/news/m4-ai-ops-dashboard",
      "http://localhost:3000/zh/news/m4-ai-ops-dashboard",
    ]));
    expect(urls.filter((url) => url.includes("static-update"))).toHaveLength(0);
  });

  it("does not publish build logs, and a build-log read failure cannot blank the sitemap", async () => {
    publicPosts.listPublishedBuildLogs.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/news/m4-ai-ops-dashboard"))).toBe(false);
    expect(publicPosts.listPublishedBuildLogs).not.toHaveBeenCalled();
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

  it("reports a showcase read failure instead of omitting published URLs", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));
    await expect(sitemap()).rejects.toThrow("TRANSIENT_DATABASE_READ");
  });

  it("declares en, zh-HK and an English x-default alternate on every static entry", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    const entries = await sitemap();
    const home = entries.find((entry) => entry.url === "http://localhost:3000/")!;
    expect(home.alternates?.languages).toEqual({
      en: "http://localhost:3000/",
      "zh-HK": "http://localhost:3000/zh",
      "x-default": "http://localhost:3000/",
    });

    // Verify every entry has x-default matching its en value
    for (const entry of entries) {
      if (entry.alternates?.languages) {
        expect(entry.alternates.languages["x-default"]).toBe(entry.alternates.languages.en);
      }
    }
  });

  it("sets lastmod from file mtime or a content timestamp, never a handwritten date", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.listPublishedNews.mockResolvedValue([
      {slug: "harbour-note", title: "Harbour note", publishedAt: new Date("2026-08-01T00:00:00.000Z"), author: "WTIA"},
    ]);
    const entries = await sitemap();
    const home = entries.find((entry) => entry.url === "http://localhost:3000/")!;
    const news = entries.find((entry) => entry.url === "http://localhost:3000/news/harbour-note")!;
    expect(home.lastModified).toEqual(fileMtime("app/[locale]/(public)/page.tsx"));
    expect(news.lastModified).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(true);
    const source = readFileSync("app/sitemap.ts", "utf8");
    expect(source).not.toMatch(/lastModified:\s*["']20\d{2}-/);
    expect(source).not.toMatch(/new Date\(\s*["']20/);
  });
});

describe("published member pages in the sitemap (D-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.listPublishedNews.mockResolvedValue([]);
    events.listPublicSlugs.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
  });

  it("adds both localized URLs for each published member slug", async () => {
    companyProfiles.listPublishedSlugs.mockResolvedValue(["harbour-vision-ai"]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/members/harbour-vision-ai",
      "http://localhost:3000/zh/members/harbour-vision-ai",
    ]));
  });

  it("reports a member read failure instead of omitting reviewed profiles", async () => {
    companyProfiles.listPublishedSlugs.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    await expect(sitemap()).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
