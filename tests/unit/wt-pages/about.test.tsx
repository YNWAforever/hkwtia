import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const {translationState, setRequestLocaleSpy} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {
    translationState: state,
    setRequestLocaleSpy: vi.fn((locale: Locale) => {
      state.locale = locale;
    }),
  };
});

const buildPageMetadataSpy = vi.hoisted(() => vi.fn((input: unknown) => input));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each([
    ["en", "/about/history", "/about/chairman", "/about/committees"],
    ["zh-HK", "/zh/about/history", "/zh/about/chairman", "/zh/about/committees"],
  ] as const)("renders the hero, compass, role cards, manifesto and related footer in %s", async (locale, historyHref, chairmanHref, committeesHref) => {
    const messages = locale === "en" ? en : zh;
    const {default: AboutPage} = await import("@/app/[locale]/(public)/about/page");
    renderWithIntl(locale, await AboutPage({params: Promise.resolve({locale})}));

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: messages.About.title})).toBeVisible();
    expect(screen.getByRole("img", {name: messages.About.imageAlt})).toHaveAttribute("src", "/images/about-hero.jpg");

    // Breadcrumb: the eyebrow text appears twice (hero eyebrow + breadcrumb current).
    expect(screen.getByRole("link", {name: messages.Common.breadcrumbHome})).toHaveAttribute("href", locale === "en" ? "/" : "/zh");
    expect(screen.getAllByText(messages.About.eyebrow)).toHaveLength(2);

    // Compass: 3 real links to the other About pages, using each page's own eyebrow/title.
    expect(screen.getByRole("link", {name: messages.History.title})).toHaveAttribute("href", historyHref);
    expect(screen.getByRole("link", {name: messages.Chairman.title})).toHaveAttribute("href", chairmanHref);
    expect(screen.getByRole("link", {name: messages.Committees.title})).toHaveAttribute("href", committeesHref);

    // Role cards, restyled into rich-items-cards.
    const cardsGrid = document.querySelector(".rich-items-cards");
    expect(cardsGrid).toBeInTheDocument();
    expect(within(cardsGrid as HTMLElement).getAllByRole("article")).toHaveLength(3);
    for (const role of ["connect", "advance", "represent"] as const) {
      expect(screen.getByRole("heading", {level: 3, name: messages.About[role].title})).toBeVisible();
      expect(screen.getByText(messages.About[role].description)).toBeVisible();
    }

    // Manifesto: the existing mission copy, re-homed verbatim, plus the founding facts and CTA.
    const manifesto = document.querySelector(".manifesto");
    expect(manifesto).toBeInTheDocument();
    const withinManifesto = within(manifesto as HTMLElement);
    expect(withinManifesto.getByRole("heading", {level: 2, name: messages.About.missionBody})).toBeVisible();
    expect(withinManifesto.getByText(messages.About.missionTitle)).toBeVisible();
    expect(withinManifesto.getByRole("heading", {level: 3, name: messages.About.foundedTitle})).toBeVisible();
    expect(withinManifesto.getByText(messages.About.foundedBody)).toBeVisible();
    expect(withinManifesto.getByRole("link", {name: new RegExp(messages.About.historyLink)})).toHaveAttribute("href", historyHref);

    // Related footer: the other three About pages, not /about itself.
    const related = document.querySelector(".rich-related-grid");
    expect(related).toBeInTheDocument();
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      historyHref, chairmanHref, committeesHref,
    ]);

    expect(document.querySelector('a[href^="/zh/zh"]')).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it("preserves the exact metadata inputs", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/about/page");
    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const messages = locale === "en" ? en : zh;
      const expected = {locale, pathname: "/about", title: messages.About.metaTitle, description: messages.About.metaDescription, image: "/images/about-hero.jpg"};
      expect(await generateMetadata({params: Promise.resolve({locale})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it("stays server-only on the RichPage primitives", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("RichRelatedRoutes");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
    expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
  });
});
