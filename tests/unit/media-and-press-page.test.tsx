import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
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
    const {listPressClippings, pressClippingSourceCount} = await import("@/lib/media/press-clippings");
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

    const {default: MediaAndPressPage} = await import("@/app/[locale]/(public)/media-and-press-coverage/page");
    render(await MediaAndPressPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: "Media and Press Coverage"})).toBeInTheDocument();
    expect(screen.getByText("Selected coverage of WTIA programmes, awards and industry surveys.")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: siteConfig.contact.email})).toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(document.body.textContent).toContain("For press and media enquiries, please contact our Media Team: contact@hkwtia.org");
    expect(document.body.textContent).not.toMatch(/2989|media@/i);
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).not.toContain(bundles.en.News.emptyTitle);

    const table = screen.getByRole("table", {name: "Media and Press Coverage"});
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Date", "Outlet", "Article"]);
    const articleLinks = within(table).getAllByRole("link");
    expect(articleLinks).toHaveLength(81);
    expect(articleLinks[0]).toHaveAttribute("href", wall[0]?.articleUrl);
    expect(articleLinks[0]).toHaveAttribute("target", "_blank");
    expect(articleLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(articleLinks[0]).toHaveTextContent(wall[0]?.title ?? "");
    expect(within(table).getAllByRole("row")[1]?.textContent).toContain("TechRitual");
  });

  it("renders the Chinese chrome and keeps staff news off this route", async () => {
    const {default: MediaAndPressPage} = await import("@/app/[locale]/(public)/media-and-press-coverage/page");
    render(await MediaAndPressPage({params: Promise.resolve({locale: "zh-HK"})}));

    expect(screen.getByRole("heading", {level: 1, name: "傳媒及新聞報道"})).toBeInTheDocument();
    expect(screen.getByText("節錄有關 WTIA 計劃、獎項及業界調查的報道。")).toBeInTheDocument();
    expect(document.body.textContent).toContain("傳媒查詢，請聯絡傳媒組：contact@hkwtia.org");
    const table = screen.getByRole("table", {name: "傳媒及新聞報道"});
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["日期", "媒體", "報道"]);
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
