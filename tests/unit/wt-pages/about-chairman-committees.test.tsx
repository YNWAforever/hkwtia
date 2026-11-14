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
    const translate = (key: string) => {
      // An unscoped getTranslations({locale}) resolves fully-qualified keys from the
      // bundle root, so an absent namespace starts there rather than at [undefined].
      let value: unknown = namespace === undefined
        ? translationState.messages[locale]
        : translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return value;
    };
    // t.raw returns the stored string without ICU parsing, which the roster uses
    // so a biography apostrophe is not treated as a quote.
    return Object.assign(translate, {raw: translate});
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
  "Donald Chan",
  "Jimmy Chan",
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

  it("renders the hero and fourteen Executive Committee cards, with no compass", async () => {
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
    expect(cards).toHaveLength(14);
    expect(cards.map((card) => within(card).getByRole("heading", {level: 3}).textContent)).toEqual([...rosterOrder]);
    const card = (slug: string) => {
      const found = roster?.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
      if (!found) throw new Error(`missing roster card ${slug}`);
      return found;
    };
    expect(card("willy-lai").querySelector(".exco-roster-role")).toHaveTextContent("Chairman");
    expect(card("willy-lai").querySelector(".exco-roster-title")).toHaveTextContent("Chairman of WTIA");
    expect(card("lawrence-cheung").querySelector(".exco-roster-role")).toHaveTextContent("Vice Chairman");
    expect(card("nelson-tse").querySelector(".exco-roster-role")).toHaveTextContent("Treasurer & Executive Committee Member");
    expect(card("eric-yung").querySelector(".exco-roster-role")).toHaveTextContent("Legal Advisor");
    expect(card("simon-ha").querySelector(".exco-roster-role")).toHaveTextContent("ExCo Member");
    expect(card("alex-kun").querySelector(".exco-roster-title")).toHaveTextContent("Principal Lead – Business Development & Innovation");
    expect(card("alex-kun").querySelector(".exco-roster-role")).toBeNull();
    expect(card("alex-kun").querySelector("img")).toBeNull();
    expect(card("alex-kun").querySelector(".exco-roster-fallback")).toHaveTextContent("AK");
    expect(card("donald-chan").querySelector(".exco-roster-role")).toBeNull();
    expect(card("donald-chan").querySelector(".exco-roster-title")).toBeNull();
    expect(card("donald-chan").querySelector("img")).toBeNull();
    expect(card("donald-chan").querySelector(".exco-roster-fallback")).toHaveTextContent("DC");
    expect(card("donald-chan").querySelector(".exco-roster-pending")).toHaveTextContent("Biography to follow");
    expect(card("jimmy-chan").querySelector(".exco-roster-fallback")).toHaveTextContent("JC");
    expect(card("jimmy-chan").querySelector(".exco-roster-pending")).toHaveTextContent("Biography to follow");
    expect(card("jimmy-chan").querySelector(".exco-roster-bio")).toBeNull();
    expect(card("lawrence-cheung").querySelector("img")).toHaveAttribute("src", "/images/exco/lawrence-cheung.jpg");
    expect(card("ricky-chan").querySelector("img")).toHaveClass("exco-roster-photo-top");
    expect(card("antony-ma").querySelector("img")).toHaveClass("exco-roster-photo-top");
    expect(card("larry-lam").querySelector("img")).not.toHaveClass("exco-roster-photo-top");
    const larryLink = within(card("larry-lam")).getByRole("link", {name: "LinkedIn"});
    expect(larryLink).toHaveAttribute("href", "https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false");
    expect(larryLink).toHaveAttribute("target", "_blank");
    expect(larryLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(card("larry-lam").querySelector(".exco-roster-bio")?.textContent).not.toMatch(/linkedin/i);
    expect([...(roster as HTMLElement).querySelectorAll("a")].map((link) => link.getAttribute("href")).filter((href) => href?.includes("linkedin"))).toEqual(["https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false"]);
    for (const card of cards) {
      const image = card.querySelector("img");
      if (!image) continue;
      expect(image).toHaveAttribute("alt", within(card).getByRole("heading", {level: 3}).textContent);
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image.getAttribute("sizes")).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(/會長|陳甘泉|WiseTech/);
    expect(document.body.textContent).not.toMatch(/副主席|司庫|法律顧問|執行委員會委員/);
    expect(document.body.textContent).toMatch(/Donald Chan/);
    expect(document.body.textContent).toMatch(/Jimmy Chan/);
    expect(document.querySelector(".rich-compass")).not.toBeInTheDocument();
    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/history", "/about/chairman",
    ]);
  });

  it("renders the approved zh-HK bios and role labels, with no 會長", async () => {
    const {default: CommitteesPage} = await import("@/app/[locale]/(public)/about/committees/page");
    renderWithIntl("zh-HK", await CommitteesPage({params: Promise.resolve({locale: "zh-HK"})}));

    const roster = document.querySelector(".exco-roster");
    const cards = within(roster as HTMLElement).getAllByRole("article");
    expect(cards).toHaveLength(14);
    const card = (slug: string) => {
      const found = roster?.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
      if (!found) throw new Error(`missing roster card ${slug}`);
      return found;
    };
    const willy = card("willy-lai");
    expect(within(willy).getByRole("heading", {level: 3})).toHaveTextContent("賴志偉（Willy Lai）");
    expect(willy.querySelector(".exco-roster-role")).toHaveTextContent("主席");
    expect(willy.querySelector(".exco-roster-title")).toHaveTextContent("主席");
    expect(within(card("simon-ha")).getByRole("heading", {level: 3})).toHaveTextContent("夏羽（Simon Ha）");
    expect(card("simon-ha").querySelector(".exco-roster-role")).toHaveTextContent("執行委員會委員");
    expect(card("lawrence-cheung").querySelector(".exco-roster-role")).toHaveTextContent("副主席");
    expect(card("nelson-tse").querySelector(".exco-roster-role")).toHaveTextContent("司庫及執行委員會委員");
    expect(card("eric-yung").querySelector(".exco-roster-role")).toHaveTextContent("法律顧問");
    expect(card("burton-chau").querySelector(".exco-roster-title")).toHaveTextContent("總經理，Sanuker Inc. Limited");
    expect(card("larry-lam").querySelector(".exco-roster-title")).toBeNull();
    expect(card("lawrence-poon").querySelector(".exco-roster-title")).toBeNull();
    expect(card("donald-chan").querySelector(".exco-roster-pending")).toHaveTextContent("Biography to follow");
    expect(within(card("donald-chan")).getByRole("heading", {level: 3})).toHaveTextContent("Donald Chan");
    expect(within(card("jimmy-chan")).getByRole("heading", {level: 3})).toHaveTextContent("Jimmy Chan");
    const larryLink = within(card("larry-lam")).getByRole("link", {name: "LinkedIn"});
    expect(larryLink).toHaveAttribute("href", "https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false");
    expect(card("larry-lam").querySelector(".exco-roster-bio")?.textContent).not.toMatch(/linkedin/i);
    expect(document.body.textContent).not.toMatch(/會長|陳甘泉|譯註|開放問題/);
    expect(document.body.textContent).toMatch(/副主席/);
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
