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
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace?: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string) => {
      // An unscoped getTranslations({locale}) resolves fully-qualified keys from the
      // bundle root, so an absent namespace starts there rather than at [undefined].
      let value: unknown = namespace === undefined
        ? translationState.messages[locale]
        : translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return value;
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next/image", () => ({
  default: ({alt, fill, ...props}: ImgHTMLAttributes<HTMLImageElement> & {fill?: boolean}) => {
    void fill;
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

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
    expect(within(quote).getByText("Dear Members and Friends,")).toBeVisible();
    expect(quote.textContent).toContain("I am honoured to take on the role of Chairman of WTIA.");
    expect(quote.textContent).toContain("Hong Kong Wireless Technology Industry Association (WTIA)");
    expect(within(quote).queryByText(en.Chairman.signature)).not.toBeInTheDocument();
    expect(quote.querySelector("cite")).toBeNull();
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

const rosterOrder = [
  "Willy Lai",
  "Ricky CHAN",
  "Burton Chau",
  "Lawrence Cheung",
  "Simon Ha",
  "Alex Kun",
  "Larry Lam",
  "Antony Ma",
  "Jess Mak",
  "Lawrence Poon",
  "Nelson Tse",
  "Eric Yung",
] as const;

describe("/about/committees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and twelve Executive Committee cards, with no compass", async () => {
    const {default: CommitteesPage} = await import("@/app/[locale]/(public)/about/committees/page");
    renderWithIntl("en", await CommitteesPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.Committees.title})).toBeVisible();
    expect(screen.getByText(en.Committees.summary)).toBeVisible();
    expect(screen.getByRole("heading", {level: 2, name: en.Committees.executive.title})).toBeVisible();
    expect(document.querySelector(".rich-items-cards")).not.toBeInTheDocument();
    for (const committee of ["innovation", "membership"] as const) {
      expect(screen.queryByRole("heading", {name: en.Committees[committee].title})).toBeNull();
    }
    const roster = document.querySelector(".exco-roster");
    expect(roster).not.toBeNull();
    const cards = within(roster as HTMLElement).getAllByRole("article");
    expect(cards).toHaveLength(12);
    expect(cards.map((card) => within(card).getByRole("heading", {level: 3}).textContent)).toEqual([...rosterOrder]);
    const willy = cards[0];
    const ricky = cards[1];
    const lawrenceCheung = cards[3];
    const alex = cards[5];
    const antony = cards[7];
    if (!willy || !ricky || !lawrenceCheung || !alex || !antony) throw new Error("missing roster card");
    expect(willy.querySelector(".exco-roster-title")).toHaveTextContent("Chairman of WTIA");
    expect(alex.querySelector("img")).toBeNull();
    expect(alex.querySelector(".exco-roster-fallback")).toHaveTextContent("AK");
    expect(lawrenceCheung.querySelector("img")).toHaveAttribute("src", "/images/exco/lawrence-cheung.jpg");
    expect(ricky.querySelector("img")).toHaveClass("exco-roster-photo-top");
    expect(antony.querySelector("img")).toHaveClass("exco-roster-photo-top");
    for (const card of cards) {
      const image = card.querySelector("img");
      if (!image) continue;
      expect(image).toHaveAttribute("alt", within(card).getByRole("heading", {level: 3}).textContent);
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image.getAttribute("sizes")).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(/Donald|Jimmy|會長|WiseTech|linkedin/i);
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/chairman",
    ]);
  });

  it("renders Willy first as 主席 on zh-HK, with English bios and no 會長", async () => {
    const {default: CommitteesPage} = await import("@/app/[locale]/(public)/about/committees/page");
    renderWithIntl("zh-HK", await CommitteesPage({params: Promise.resolve({locale: "zh-HK"})}));

    const roster = document.querySelector(".exco-roster");
    const cards = within(roster as HTMLElement).getAllByRole("article");
    expect(cards).toHaveLength(12);
    const willy = cards[0];
    const burton = cards[2];
    const simon = cards[4];
    const larry = cards[6];
    const lawrencePoon = cards[9];
    if (!willy || !burton || !simon || !larry || !lawrencePoon) throw new Error("missing roster card");
    expect(within(willy).getByRole("heading", {level: 3})).toHaveTextContent("賴志偉");
    expect(within(willy).getByText("主席")).toBeVisible();
    expect(within(willy).getByText(/Chairman of WTIA/)).toBeVisible();
    expect(within(simon).getByRole("heading", {level: 3})).toHaveTextContent("夏羽");
    expect(within(simon).getByText(/Simon Ha \(夏羽\)/)).toBeVisible();
    expect(burton.querySelector(".exco-roster-title")).toHaveTextContent("General Manager, Sanuker Inc. Limited");
    expect(larry.querySelector(".exco-roster-title")).toBeNull();
    expect(lawrencePoon.querySelector(".exco-roster-title")).toBeNull();
    expect(document.body.textContent).not.toMatch(/會長/);
    expect(document.body.textContent).not.toMatch(/Donald|Jimmy/);
  });

  it("stays server-only, with the roster in place of the unconfirmed-committee grid", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/about/committees/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("ExcoRoster");
    expect(source).not.toContain("rich-items-cards");
    expect(source).not.toContain("roster is not confirmed");
    expect(source).not.toContain("RichCompass");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
