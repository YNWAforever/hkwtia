import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ReactElement} from "react";
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
    return (key: string) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return value;
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("/about/chairman", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and the unattributed message, with no compass and no card grid", async () => {
    const {default: ChairmanPage} = await import("@/app/[locale]/(public)/about/chairman/page");
    renderWithIntl("en", await ChairmanPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.Chairman.title})).toBeVisible();
    const quote = screen.getByRole("blockquote");
    expect(within(quote).getByText(en.Chairman.message)).toBeVisible();
    expect(within(quote).getByText(en.Chairman.signature).tagName).toBe("CITE");
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    expect(document.querySelector(".rich-items-cards")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/committees",
    ]);
  });

  it("stays server-only, keeping StorySection for the prose message", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/chairman/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("StorySection");
    expect(source).not.toContain("RichCompass");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});

describe("/about/committees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and exactly the three committee cards, with no compass", async () => {
    const {default: CommitteesPage} = await import("@/app/[locale]/(public)/about/committees/page");
    renderWithIntl("en", await CommitteesPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.Committees.title})).toBeVisible();
    const cardsGrid = document.querySelector(".rich-items-cards");
    expect(cardsGrid).toBeInTheDocument();
    expect(within(cardsGrid as HTMLElement).getAllByRole("article")).toHaveLength(3);
    for (const committee of ["executive", "innovation", "membership"] as const) {
      expect(screen.getByRole("heading", {level: 3, name: en.Committees[committee].title})).toBeVisible();
      expect(screen.getByText(en.Committees[committee].description)).toBeVisible();
    }
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/chairman",
    ]);
  });

  it("stays server-only on rich-items-cards, with no manufactured compass", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/committees/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("rich-items-cards");
    expect(source).not.toContain("RichCompass");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
