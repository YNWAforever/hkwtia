import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublishedNews = vi.hoisted(() => vi.fn());
const listPublishedBuildLogs = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string) => String(messageAt(locale, namespace, key)),
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/db/repos/public-posts", () => ({listPublishedNews, listPublishedBuildLogs}));
// PageHero and FooterNewsletter both render real hooks/components from @/i18n/navigation
// (Link, and FooterNewsletter's usePathname/useRouter) with no intl-context provider in this
// render tree -- the same situation Task 17 hit with m6-launchpad-page.test.tsx and
// launchpad-partner-cutover.test.tsx. Mocked here with the repo's established plain-passthrough
// pattern (tests/unit/wt-pages/launchpad-page.test.tsx and tests/unit/site-footer.test.tsx).
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/news",
  useRouter: () => ({replace: vi.fn()}),
}));

const newsRow = {slug: "n1", title: "News item", publishedAt: new Date("2026-08-01T00:00:00.000Z"), author: "WTIA"};
const buildLogRow = {slug: "b1", titleEn: "Build log item", titleZh: "開發日誌項目", publishedAt: new Date("2026-08-02T00:00:00.000Z"), author: "WTIA"};

describe("News page — status labels, research quality, subscribe", () => {
  beforeEach(() => {
    listPublishedNews.mockReset().mockResolvedValue([newsRow]);
    listPublishedBuildLogs.mockReset().mockResolvedValue([buildLogRow]);
  });

  it("renders one grid with a distinguishing status label per card, the quality panel, and the subscribe band", async () => {
    const {default: NewsPage} = await import("@/app/[locale]/(public)/news/page");
    render(await NewsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
    const grid = document.querySelector(".archive-grid");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll(":scope > article")).toHaveLength(2);
    // Scoped to the grid: News.eyebrow and News.breadcrumbCurrent are both "News" in the
    // English bundle (same literal collision the PageHero eyebrow and breadcrumb already share
    // elsewhere in this design programme), so an unscoped screen.getAllByText also picks up the
    // hero's eyebrow and breadcrumb text. The test's actual intent -- one distinguishing status
    // label per card within the listing -- only needs the grid's own text scoped via `within`.
    expect(within(grid as HTMLElement).getAllByText(bundles.en.News.statusNews)).toHaveLength(1);
    expect(within(grid as HTMLElement).getAllByText(bundles.en.News.statusBuildLog)).toHaveLength(1);
    expect(document.querySelector(".news-quality-panel")).not.toBeNull();
    expect(screen.getByText(bundles.en.News.quality.title)).toBeInTheDocument();
    expect(document.querySelector(".news-subscribe-band .footer-newsletter")).not.toBeNull();
  });
});
