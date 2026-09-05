import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {milestones} from "@/content/milestones";
import {historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";

type Locale = "en" | "zh-HK";
const realFacts = historyCompassFacts(milestonesOnly(milestones));

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

// Minimal, targeted resolver for the one ICU plural pattern History.compass.milestonesValue
// uses (`{count, plural, one {...} other {...}}`), mirroring
// tests/unit/home-programme-showcase.test.tsx's resolveIcuPlural -- without this, the plain
// `{name}` substitution below leaves the plural clause as the literal characters
// `# milestone(s)`, never a digit, which makes any assertion matching the real milestone
// count vacuously fail regardless of what the component renders.
function resolveIcuPlural(raw: string, values: Record<string, string | number>): string {
  return raw.replace(/\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/, (_match, varName: string, onePattern: string, otherPattern: string) => {
    const count = Number(values[varName]);
    const chosen = count === 1 ? onePattern : otherPattern;
    return chosen.replace('#', String(count));
  });
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      const raw = resolveIcuPlural(value, values ?? {});
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
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

describe("/about/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the hero and a compass of the real founding year, milestone count and latest year", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    renderWithIntl("en", await HistoryPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.History.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(realFacts.foundingYear));
    expect(compass?.textContent).toContain(String(realFacts.milestoneCount));
    expect(compass?.textContent).toContain(String(realFacts.latestYear));
    expect(document.querySelectorAll(".rich-compass-grid>div")).toHaveLength(3);
  });

  it("keeps a RichRelatedRoutes footer to the other three About pages", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    renderWithIntl("en", await HistoryPage({params: Promise.resolve({locale: "en"})}));

    const related = document.querySelector(".rich-related-grid");
    expect(within(related as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about", "/about/chairman", "/about/committees",
    ]);
  });

  it("gives the featured detail page the identical hero/compass treatment as the list page", async () => {
    const gallerySlug = "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner";
    const {default: HistoryDetailPage} = await import("@/app/[locale]/(public)/about/history/[slug]/page");
    // PageHero's breadcrumb Link and RichRelatedRoutes' Links come from @/i18n/navigation,
    // which reads useLocale() from context -- this page needs the provider like the others.
    renderWithIntl("en", await HistoryDetailPage({params: Promise.resolve({locale: "en", slug: gallerySlug})}));

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(realFacts.foundingYear));
    expect(compass?.textContent).toContain(String(realFacts.milestoneCount));
    expect(compass?.textContent).toContain(String(realFacts.latestYear));
  });

  it("stays server-only on the RichPage primitives", () => {
    for (const file of ["app/[locale]/(public)/about/history/page.tsx", "app/[locale]/(public)/about/history/[slug]/page.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("PageHero");
      expect(source).toContain("RichCompass");
      expect(source).not.toContain("InstitutionalPageIntro");
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
});
