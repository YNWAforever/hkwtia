import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
  getPublishedBuildLogBySlug: vi.fn(),
  listPublishedNews: vi.fn(),
  getPublishedNewsBySlug: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/db/repos/public-posts", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/repos/public-posts")>(),
  ...publicPosts,
}));
vi.mock("next/navigation", () => navigation);
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => `translated:${key}`),
  setRequestLocale: vi.fn(),
}));
// The rewritten news index now renders PageHero and FooterNewsletter, both of which pull in
// @/i18n/navigation's real createNavigation() output -- which needs the full next/navigation
// export surface that the partial mock above (just `notFound`) doesn't carry. Mocked here with
// the repo's established plain-passthrough pattern (same situation Task 17 hit with
// m6-launchpad-page.test.tsx / launchpad-partner-cutover.test.tsx); this file's own assertions
// (including the exact accessible link names below) are unchanged.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/news",
  useRouter: () => ({replace: vi.fn()}),
}));

import NewsPage from "@/app/[locale]/(public)/news/page";
import NewsPostPage, {
  generateMetadata,
} from "@/app/[locale]/(public)/news/[slug]/page";

const summary = {
  slug: "m4-ai-ops-dashboard",
  titleEn: "How we built the AI-Ops dashboard",
  titleZh: "我們如何建立 AI 營運儀表板",
  publishedAt: new Date("2026-07-29T04:00:00.000Z"),
  author: "HKWTIA Engineering",
} as const;
const detail = {
  ...summary,
  bodyMdx: [
    "## Build notes",
    "",
    "Published **evidence**.",
    "",
    "- [AI-Ops dashboard](/en/ai-ops)",
  ].join("\n"),
} as const;
const newsSummary = {
  slug: "wtia-welcomes-new-members",
  title: "WTIA welcomes new members",
  publishedAt: new Date("2026-08-01T02:00:00.000Z"),
  author: "WTIA",
} as const;
const zhNewsSummary = {
  ...newsSummary,
  title: "WTIA 歡迎新會員",
} as const;
const newsDetail = {
  ...newsSummary,
  body: ["## Welcome", "", "A **warm** welcome."].join("\n"),
} as const;

describe("published posts through news routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([summary]);
    publicPosts.getPublishedBuildLogBySlug.mockResolvedValue(detail);
    publicPosts.listPublishedNews.mockResolvedValue([newsSummary]);
    publicPosts.getPublishedNewsBySlug.mockResolvedValue(null);
  });

  it("renders staff news and build-log cards with localized titles", async () => {
    publicPosts.listPublishedNews.mockResolvedValueOnce([zhNewsSummary]);

    render(await NewsPage({params: Promise.resolve({locale: "zh-HK"})}));

    expect(
      screen.getByRole("link", {name: "WTIA 歡迎新會員"}),
    ).toHaveAttribute("href", "/zh/news/wtia-welcomes-new-members");
    expect(
      screen.getByRole("link", {name: "我們如何建立 AI 營運儀表板"}),
    ).toHaveAttribute("href", "/zh/news/m4-ai-ops-dashboard");
    expect(publicPosts.listPublishedNews).toHaveBeenCalledWith("zh-HK");
    expect(publicPosts.listPublishedBuildLogs).toHaveBeenCalledOnce();
  });

  it("shows the empty state when nothing is published", async () => {
    publicPosts.listPublishedNews.mockResolvedValueOnce([]);
    publicPosts.listPublishedBuildLogs.mockResolvedValueOnce([]);

    render(await NewsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByText("translated:emptyTitle")).toBeInTheDocument();
  });

  it("degrades to the empty state when the database is unavailable", async () => {
    publicPosts.listPublishedNews.mockRejectedValueOnce(new Error("DB_DOWN"));
    publicPosts.listPublishedBuildLogs.mockRejectedValueOnce(new Error("DB_DOWN"));

    render(await NewsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByText("translated:emptyTitle")).toBeInTheDocument();
  });

  it("resolves a news slug without falling through to build logs", async () => {
    publicPosts.getPublishedNewsBySlug.mockResolvedValueOnce(newsDetail);

    render(await NewsPostPage({
      params: Promise.resolve({locale: "en", slug: newsSummary.slug}),
    }));

    expect(
      screen.getAllByRole("heading", {level: 1, name: "WTIA welcomes new members"}),
    ).toHaveLength(1);
    expect(publicPosts.getPublishedNewsBySlug).toHaveBeenCalledWith("en", newsSummary.slug);
    expect(publicPosts.getPublishedBuildLogBySlug).not.toHaveBeenCalled();
  });

  it("renders a published build log with one page-owned h1", async () => {
    render(await NewsPostPage({
      params: Promise.resolve({locale: "en", slug: summary.slug}),
    }));

    expect(
      screen.getAllByRole("heading", {
        level: 1,
        name: "How we built the AI-Ops dashboard",
      }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", {level: 2, name: "Build notes"}),
    ).toBeInTheDocument();
    expect(screen.getByText("evidence")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "AI-Ops dashboard"})).toHaveAttribute(
      "href",
      "/en/ai-ops",
    );
  });

  it.each(["draft-post", "future-post", "unknown-post"])(
    "calls notFound for unpublished or unknown slug %s",
    async (slug) => {
      publicPosts.getPublishedNewsBySlug.mockResolvedValueOnce(null);
      publicPosts.getPublishedBuildLogBySlug.mockResolvedValueOnce(null);

      await expect(
        NewsPostPage({params: Promise.resolve({locale: "en", slug})}),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(navigation.notFound).toHaveBeenCalledOnce();
    },
  );

  it("maps malformed public slugs to notFound for the page and metadata", async () => {
    await expect(
      NewsPostPage({
        params: Promise.resolve({locale: "en", slug: "../private"}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      generateMetadata({
        params: Promise.resolve({locale: "en", slug: "../private"}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalledTimes(2);
    expect(publicPosts.getPublishedNewsBySlug).not.toHaveBeenCalled();
    expect(publicPosts.getPublishedBuildLogBySlug).not.toHaveBeenCalled();
  });

  it("does not hide non-validation repository failures", async () => {
    publicPosts.getPublishedNewsBySlug.mockRejectedValueOnce(
      new Error("TRANSIENT_DATABASE_READ"),
    );

    await expect(
      NewsPostPage({
        params: Promise.resolve({locale: "en", slug: "valid-slug"}),
      }),
    ).rejects.toThrow("TRANSIENT_DATABASE_READ");
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "How we built the AI-Ops dashboard"],
    ["zh-HK", "我們如何建立 AI 營運儀表板"],
  ])("selects the %s build-log title for metadata", async (locale, title) => {
    const metadata = await generateMetadata({
      params: Promise.resolve({locale, slug: summary.slug}),
    });

    expect(metadata.title).toBe(title);
  });
});
