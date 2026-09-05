import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedNews: vi.fn(),
  listPublishedBuildLogs: vi.fn(),
  getPublishedNewsBySlug: vi.fn(),
  getPublishedBuildLogBySlug: vi.fn(),
  parsePublishedBuildLogSlug: vi.fn((slug: string) => slug),
}));
const events = vi.hoisted(() => ({listPublic: vi.fn()}));
const showcase = vi.hoisted(() => ({listPublishedSlugs: vi.fn()}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => undefined,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
// The rewritten news index now renders PageHero and FooterNewsletter, both of which pull in
// @/i18n/navigation's real createNavigation() output -- which needs the full next/navigation
// export surface (redirect, permanentRedirect, etc.) that the partial mock above doesn't carry.
// Mocked here with the repo's established plain-passthrough pattern (same situation Task 17 hit
// with m6-launchpad-page.test.tsx / launchpad-partner-cutover.test.tsx); this file's own
// assertions are unchanged.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/news",
  useRouter: () => ({replace: vi.fn()}),
}));

import NewsPage from "@/app/[locale]/(public)/news/page";
import NewsPostPage, {generateMetadata} from "@/app/[locale]/(public)/news/[slug]/page";
import sitemap from "@/app/sitemap";

const publishedAt = new Date("2026-08-28T12:00:00.000Z");
const chineseNews = {
  slug: "bilingual-news",
  title: "繁體消息",
  publishedAt,
  author: "WTIA",
  body: "## 繁體標題\n\n繁體內容",
};
const englishNews = {
  slug: "bilingual-news",
  title: "English news",
  publishedAt,
  author: "WTIA",
};
const englishOnlyNews = {
  slug: "english-only",
  title: "English only",
  publishedAt,
  author: "WTIA",
};
const buildLog = {
  slug: "build-log",
  titleEn: "Build log",
  titleZh: "營運日誌",
  publishedAt,
  author: "WTIA",
  bodyMdx: "## Operational evidence",
};

async function renderNewsIndex(locale: "en" | "zh-HK") {
  return renderToStaticMarkup(await NewsPage({params: Promise.resolve({locale})}));
}

async function renderNewsDetail(locale: "en" | "zh-HK", slug = chineseNews.slug) {
  return renderToStaticMarkup(await NewsPostPage({
    params: Promise.resolve({locale, slug}),
  }));
}

describe("localized public News pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedNews.mockResolvedValue([chineseNews]);
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.getPublishedNewsBySlug.mockResolvedValue(chineseNews);
    publicPosts.getPublishedBuildLogBySlug.mockResolvedValue(null);
    events.listPublic.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
  });

  it("uses the requested locale for the index reader and normalized card title", async () => {
    const html = await renderNewsIndex("zh-HK");

    expect(publicPosts.listPublishedNews).toHaveBeenCalledWith("zh-HK");
    expect(html).toContain("繁體消息");
  });

  it("uses the localized News body for detail and metadata", async () => {
    const html = await renderNewsDetail("zh-HK");
    const metadata = await generateMetadata({
      params: Promise.resolve({locale: "zh-HK", slug: chineseNews.slug}),
    });

    expect(publicPosts.getPublishedNewsBySlug).toHaveBeenCalledWith("zh-HK", chineseNews.slug);
    expect(html).toContain("繁體內容");
    expect(metadata.title).toBe("繁體消息");
  });

  it("returns a Chinese 404 when the News row has no eligible Chinese body", async () => {
    publicPosts.getPublishedNewsBySlug.mockResolvedValue(null);

    await expect(renderNewsDetail("zh-HK", "english-only")).rejects.toThrow("NOT_FOUND");
    expect(publicPosts.getPublishedNewsBySlug).toHaveBeenCalledWith("zh-HK", "english-only");
  });

  it("keeps the single-body Build Log renderer in the shared slug namespace", async () => {
    publicPosts.getPublishedNewsBySlug.mockResolvedValue(null);
    publicPosts.getPublishedBuildLogBySlug.mockResolvedValue(buildLog);

    await expect(renderNewsDetail("zh-HK", "build-log")).resolves.toContain("Operational evidence");
  });

  it.each([
    ["en", englishNews, "zh-HK"],
    ["zh-HK", chineseNews, "en"],
  ] as const)("retains successful %s News URLs when the other locale fails", async (successfulLocale, row, failedLocale) => {
    publicPosts.listPublishedNews.mockImplementation((locale: string) =>
      locale === successfulLocale ? Promise.resolve([row]) : Promise.reject(new Error(failedLocale)));

    const entries = await sitemap();
    const expectedUrl = successfulLocale === "en"
      ? `http://localhost:3000/news/${row.slug}`
      : `http://localhost:3000/zh/news/${row.slug}`;

    expect(entries.map((entry) => entry.url)).toContain(expectedUrl);
    expect(entries.find((entry) => entry.url === expectedUrl)?.alternates).toBeUndefined();
  });

  it("omits untranslated Chinese News and suppresses its alternate", async () => {
    publicPosts.listPublishedNews.mockImplementation((locale: string) =>
      locale === "en" ? Promise.resolve([englishOnlyNews]) : Promise.resolve([]));

    const entries = await sitemap();
    const englishUrl = "http://localhost:3000/news/english-only";

    expect(entries.map((entry) => entry.url)).toContain(englishUrl);
    expect(entries.map((entry) => entry.url)).not.toContain("http://localhost:3000/zh/news/english-only");
    expect(entries.find((entry) => entry.url === englishUrl)?.alternates).toBeUndefined();
  });

  it("keeps Build Logs in both locales with mutual alternates", async () => {
    publicPosts.listPublishedNews.mockResolvedValue([]);
    publicPosts.listPublishedBuildLogs.mockResolvedValue([buildLog]);

    const entries = (await sitemap()).filter((entry) => entry.url.endsWith("/news/build-log"));

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.alternates?.languages?.en && entry.alternates.languages?.["zh-HK"]))
      .toBe(true);
  });
});
