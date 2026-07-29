import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
  getPublishedBuildLogBySlug: vi.fn(),
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
vi.mock("@/content/news", () => ({
  newsPosts: [{
    slug: "static-update",
    publishedAt: "2026-07-01T00:00:00.000Z",
    image: "/images/projects-hero.jpg",
    namespace: "news.staticUpdate",
  }],
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

describe("published build logs through news routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([summary]);
    publicPosts.getPublishedBuildLogBySlug.mockResolvedValue(detail);
  });

  it("renders static news followed by localized published build-log cards", async () => {
    render(await NewsPage({params: Promise.resolve({locale: "zh-HK"})}));

    expect(screen.getByText("static-update")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "我們如何建立 AI 營運儀表板",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {name: "我們如何建立 AI 營運儀表板"}),
    ).toHaveAttribute("href", "/zh/news/m4-ai-ops-dashboard");
    expect(publicPosts.listPublishedBuildLogs).toHaveBeenCalledOnce();
  });

  it("renders a published database detail with one page-owned h1", async () => {
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

  it.each(["draft-build-log", "future-build-log", "unknown-build-log"])(
    "calls notFound for unpublished or unknown slug %s",
    async (slug) => {
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
    expect(publicPosts.getPublishedBuildLogBySlug).not.toHaveBeenCalled();
  });

  it("does not hide non-validation repository failures", async () => {
    publicPosts.getPublishedBuildLogBySlug.mockRejectedValueOnce(
      new Error("TRANSIENT_DATABASE_READ"),
    );

    await expect(
      NewsPostPage({
        params: Promise.resolve({locale: "en", slug: "valid-slug"}),
      }),
    ).rejects.toThrow("TRANSIENT_DATABASE_READ");
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("checks static news before querying the database fallback", async () => {
    render(await NewsPostPage({
      params: Promise.resolve({locale: "en", slug: "static-update"}),
    }));

    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent(
      "translated:title",
    );
    expect(publicPosts.getPublishedBuildLogBySlug).not.toHaveBeenCalled();
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
