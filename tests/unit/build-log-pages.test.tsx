import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const publicPosts = vi.hoisted(() => ({listPublishedBuildLogs: vi.fn(), getPublishedBuildLogBySlug: vi.fn(), listPublishedNews: vi.fn(), getPublishedNewsBySlug: vi.fn()}));
const navigation = vi.hoisted(() => ({notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); })}));
vi.mock("@/lib/db/repos/public-posts", async (importOriginal) => ({...await importOriginal<typeof import("@/lib/db/repos/public-posts")>(), ...publicPosts}));
vi.mock("next/navigation", () => navigation);
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string) => `translated:${key}`), setRequestLocale: vi.fn()}));

import NewsPage from "@/app/[locale]/(public)/news/page";
import NewsPostPage, {generateMetadata} from "@/app/[locale]/(public)/news/[slug]/page";

const summary = {slug: "m4-ai-ops-dashboard", titleEn: "How we built the AI-Ops dashboard", titleZh: "我們如何建立 AI 營運儀表板", publishedAt: new Date("2026-07-29T04:00:00.000Z"), author: "HKWTIA Engineering"} as const;
const detail = {...summary, bodyMdx: ["## Build notes", "", "Published **evidence**.", "", "- [AI-Ops dashboard](/en/ai-ops)"].join("\n")} as const;
const newsSummary = {slug: "wtia-welcomes-new-members", title: "WTIA 歡迎新會員", publishedAt: new Date("2026-08-01T02:00:00.000Z"), author: "WTIA"} as const;
const newsDetail = {...newsSummary, body: ["## Welcome", "", "A **warm** welcome."].join("\n")} as const;

describe("published posts through news routes", () => {
  beforeEach(() => { vi.clearAllMocks(); publicPosts.listPublishedBuildLogs.mockResolvedValue([summary]); publicPosts.getPublishedBuildLogBySlug.mockResolvedValue(detail); publicPosts.listPublishedNews.mockResolvedValue([newsSummary]); publicPosts.getPublishedNewsBySlug.mockResolvedValue(null); });
  it("renders normalized staff News and localized Build Log cards", async () => { render(await NewsPage({params: Promise.resolve({locale: "zh-HK"})})); expect(screen.getByRole("link", {name: "WTIA 歡迎新會員"})).toHaveAttribute("href", "/zh/news/wtia-welcomes-new-members"); expect(screen.getByRole("link", {name: "我們如何建立 AI 營運儀表板"})).toHaveAttribute("href", "/zh/news/m4-ai-ops-dashboard"); expect(publicPosts.listPublishedNews).toHaveBeenCalledWith("zh-HK"); });
  it("shows the empty state when no public rows are available", async () => { publicPosts.listPublishedNews.mockResolvedValueOnce([]); publicPosts.listPublishedBuildLogs.mockResolvedValueOnce([]); render(await NewsPage({params: Promise.resolve({locale: "en"})})); expect(screen.getByText("translated:emptyTitle")).toBeInTheDocument(); });
  it("renders News without falling through to Build Logs", async () => { publicPosts.getPublishedNewsBySlug.mockResolvedValueOnce(newsDetail); render(await NewsPostPage({params: Promise.resolve({locale: "en", slug: newsSummary.slug})})); expect(screen.getAllByRole("heading", {level: 1, name: newsSummary.title})).toHaveLength(1); expect(publicPosts.getPublishedBuildLogBySlug).not.toHaveBeenCalled(); });
  it("retains the Build Log single-body renderer", async () => { render(await NewsPostPage({params: Promise.resolve({locale: "en", slug: summary.slug})})); expect(screen.getByRole("heading", {level: 2, name: "Build notes"})).toBeInTheDocument(); expect(screen.getByText("evidence")).toBeInTheDocument(); expect(screen.getByRole("link", {name: "AI-Ops dashboard"})).toHaveAttribute("href", "/en/ai-ops"); });
  it.each(["draft-post", "future-post", "unknown-post"])("calls notFound for unknown %s", async (slug) => { publicPosts.getPublishedNewsBySlug.mockResolvedValueOnce(null); publicPosts.getPublishedBuildLogBySlug.mockResolvedValueOnce(null); await expect(NewsPostPage({params: Promise.resolve({locale: "en", slug})})).rejects.toThrow("NEXT_NOT_FOUND"); });
  it("maps malformed slugs to notFound before public reads", async () => { await expect(NewsPostPage({params: Promise.resolve({locale: "en", slug: "../private"})})).rejects.toThrow("NEXT_NOT_FOUND"); expect(publicPosts.getPublishedNewsBySlug).not.toHaveBeenCalled(); });
  it("does not hide public repository errors", async () => { publicPosts.getPublishedNewsBySlug.mockRejectedValueOnce(new Error("TRANSIENT_DATABASE_READ")); await expect(NewsPostPage({params: Promise.resolve({locale: "en", slug: "valid-slug"})})).rejects.toThrow("TRANSIENT_DATABASE_READ"); expect(navigation.notFound).not.toHaveBeenCalled(); });
  it.each([["en", summary.titleEn], ["zh-HK", summary.titleZh]] as const)("selects the %s Build Log title for metadata", async (locale, title) => { const metadata = await generateMetadata({params: Promise.resolve({locale, slug: summary.slug})}); expect(metadata.title).toBe(title); });
});
