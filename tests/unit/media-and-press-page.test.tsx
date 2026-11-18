import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {publicRoutes} from "@/config/public-routes";
import {siteConfig} from "@/config/site";
import dropped from "@/content/media-and-press/dropped-article-urls.json";
import source from "@/content/media-and-press/live-clippings.json";
import {ROUTE_BREADCRUMB_LABEL_KEYS} from "@/lib/seo/route-breadcrumbs";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string | undefined, key: string): unknown {
  const root = namespace === undefined
    ? bundles[locale]
    : namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>(
    (v, p) => (v as Record<string, unknown> | undefined)?.[p],
    root,
  );
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace?: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const value = messageAt(locale, namespace, key);
        if (typeof value !== "string") throw new Error(`MISSING_MESSAGE ${locale} ${namespace ?? ""}.${key}`);
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({alt, src}: {alt: string; src: string}) => (
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    <img alt={alt} src={src} />
  ),
}));

describe("Media and Press page", () => {
  it("publishes the live wall minus proven 404s, with email contact and no logos", async () => {
    const {listPressClippings, listPressCards, pressClippingSourceCount, pressWallSummaryCounts} = await import("@/lib/media/press-clippings");
    expect(pressClippingSourceCount).toBe(87);
    expect(source).toHaveLength(87);
    expect(dropped).toHaveLength(6);
    expect(dropped.every((row) => row.http_status === 404)).toBe(true);

    const wall = listPressClippings();
    const dead = new Set(dropped.map((row) => row.article_url));
    expect(wall).toHaveLength(81);
    expect(wall.some((row) => dead.has(row.articleUrl))).toBe(false);
    expect(new Set(wall.map((row) => row.articleUrl)).size).toBe(wall.length);
    expect(wall.map((row) => row.title)).toEqual(source.filter((row) => !dead.has(row.article_url)).map((row) => row.title));
    expect(wall.some((row) => row.articleUrl.includes("hk.finance.yahoo.com"))).toBe(true);
    expect(wall.some((row) => row.articleUrl.includes("asiatoday.com"))).toBe(true);
    expect(wall[0]?.dateLabel).toBe("1/11/2025");
    expect(wall[0]?.dateTime).toBe("2025-11-01");
    expect(source.some((row) => row.article_url.includes("&amp;"))).toBe(false);

    const counts = pressWallSummaryCounts();
    expect(counts).toMatchObject({wall: 81, candidates: 64, integrated: 64, gaps: 17, verifiedAll: false});
    expect(counts.integrated).toBe(counts.candidates);
    expect(counts.integrated).not.toBe(counts.wall);
    const cards = listPressCards("en");
    expect(cards).toHaveLength(81);
    expect(cards[0]?.dateTime).toBe("2025-11-01");
    expect(cards.filter((row) => row.summaryStatus === "draft")).toHaveLength(64);
    expect(cards.filter((row) => row.summaryStatus === "gap")).toHaveLength(17);
    expect(cards.some((row) => row.summary?.includes("42%") || row.summary?.includes("47%"))).toBe(false);
    const doubled = cards.find((row) => row.articleUrl.includes("https://hd.stheadline.com/news/realtime/hk/2340597/") && row.articleUrl.indexOf("https://", 8) > 0);
    expect(doubled?.articleUrl).toBe(wall.find((row) => row.articleUrl.includes("2340597"))?.articleUrl);
    expect(doubled?.summary).toBeNull();
    expect(cards.find((row) => row.inclusionFlag === "topic_hub")?.articleUrl).toBe("https://www.capital-hk.com/topics/ai-2");
    expect(cards.filter((row) => row.inclusionFlag === "no_wtia_mention")).toHaveLength(1);

    const {default: MediaAndPressPage} = await import("@/app/[locale]/(public)/media-and-press-coverage/page");
    render(await MediaAndPressPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "Media and Press Coverage"})).toBeInTheDocument();
    expect(screen.getByText("Selected coverage of WTIA programmes, awards and industry surveys.")).toBeInTheDocument();
    expect(screen.getByText("Links below lead to external sites.")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: siteConfig.contact.email})).toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(document.body.textContent).toContain("For press and media enquiries, please contact our Media Team: contact@hkwtia.org");
    expect(document.body.textContent).not.toMatch(/2989|media@/i);
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector(".press-card-summary")).not.toHaveStyle({overflow: "hidden"});
    expect(document.body.textContent).not.toContain(bundles.en.News.emptyTitle);
    expect(screen.getAllByText("Wire distribution").length).toBeGreaterThan(0);
    expect(screen.getByText("Editorial review: this link is a topic hub, not one article. It stays listed and is not presented as a WTIA endorsement.")).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", {name: "Read original article (opens in a new tab, external site)"});
    expect(ctas).toHaveLength(81);
    expect(ctas[0]).toHaveAttribute("href", cards[0]?.articleUrl);
    expect(ctas[0]).toHaveAttribute("target", "_blank");
    expect(ctas[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(ctas[0]).toHaveTextContent("Read original article");
    expect(screen.getByRole("heading", {level: 3, name: cards[0]?.title ?? ""})).toBeInTheDocument();
    expect(document.querySelector(".press-card-summary")).not.toBeNull();
    expect(document.body.textContent).not.toContain("longer than the length guide");
    expect(document.body.textContent).toContain("WTIA presented the Asia Smart Innovation Awards 2025 at Cordis Hong Kong on 16 October 2025.");
    const {pressSummarySource} = await import("@/lib/media/press-summaries");
    expect(pressSummarySource.handoffId).toBe("ruby-copy-handoff-20261119T0042+08");
    expect(pressSummarySource.canonical).toBe("ruby-copy.md");
    expect(pressSummarySource.canonicalSha256).toBe("b3c5f1b62b675b713ab235fb132f34021cceb5a6c56fe124a6d8d6e412580dc8");
    expect(pressSummarySource.rejected.some((path) => path.endsWith("extracts/ruby-copy-entries.json"))).toBe(true);
    expect(cards.find((row) => row.auditRow === 26)?.summary).toContain("scheduled for 11–12 July 2024");
    expect(document.body.textContent).not.toContain("Withheld");
  });

  it("renders the Chinese chrome and keeps staff news off this route", async () => {
    const {default: MediaAndPressPage} = await import("@/app/[locale]/(public)/media-and-press-coverage/page");
    render(await MediaAndPressPage({params: Promise.resolve({locale: "zh-HK"})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "傳媒及新聞報道"})).toBeInTheDocument();
    expect(screen.getByText("節錄有關 WTIA 計劃、獎項及業界調查的報道。")).toBeInTheDocument();
    expect(screen.getByText("以下連結將前往外部網站。")).toBeInTheDocument();
    expect(document.body.textContent).toContain("傳媒查詢，請聯絡傳媒組：contact@hkwtia.org");
    expect(screen.getAllByRole("link", {name: "閱讀原文（在新分頁開啟，外部網站）"})).toHaveLength(81);
    expect(screen.getByText("2025年11月1日")).toBeInTheDocument();
    expect(screen.getAllByText("新聞稿分發").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("Withheld");
    expect([...publicRoutes]).toContain("/media-and-press-coverage");
    expect([...publicRoutes]).toContain("/news");
    expect(ROUTE_BREADCRUMB_LABEL_KEYS["/media-and-press-coverage"]).toBe("Media.h1");
  });

  it("builds the gate meta title without a second brand suffix", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/media-and-press-coverage/page");
    const english = await generateMetadata({params: Promise.resolve({locale: "en"})});
    const chinese = await generateMetadata({params: Promise.resolve({locale: "zh-HK"})});
    expect(english.title).toBe("Media and Press Coverage｜Hong Kong Wireless Technology Industry Association (WTIA)");
    expect(english.description).toBe("Press coverage of WTIA programmes and surveys, with media contact details.");
    expect(chinese.title).toBe("傳媒及新聞報道｜香港無線科技商會 WTIA");
    expect(chinese.description).toBe("WTIA 計劃與調查的傳媒報道，以及傳媒查詢聯絡。");
    expect(english.alternates?.canonical).toBe("http://localhost:3000/media-and-press-coverage");
    expect(chinese.alternates?.canonical).toBe("http://localhost:3000/zh/media-and-press-coverage");
  });
});
