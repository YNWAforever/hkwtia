import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {
  default as HistoryDetailPage,
  generateMetadata,
  generateStaticParams,
} from "@/app/[locale]/(public)/about/history/[slug]/page";
import {milestones} from "@/content/milestones";
import {findBySlug} from "@/lib/history/milestones";
import {brandedTitle} from "@/lib/metadata";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const approvedStoryTitle = {
  en: "Milestone story",
  "zh-HK": "里程碑故事",
} as const;

const {buildPageMetadataSpy, notFoundSpy, setRequestLocaleSpy, translationState} = vi.hoisted(() => {
  const state = {
    locale: "en" as Locale,
    messages: {} as Record<Locale, Record<string, unknown>>,
  };
  return {
    buildPageMetadataSpy: vi.fn((input: unknown) => input),
    notFoundSpy: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    setRequestLocaleSpy: vi.fn((locale: string) => {
      state.locale = locale as Locale;
    }),
    translationState: state,
  };
});

// Only buildPageMetadata is spied; brandedTitle stays real so the D-1 suffix is asserted below.
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  buildPageMetadata: buildPageMetadataSpy,
}));
vi.mock("next-intl/server", () => ({
  // Accepts both call forms next-intl allows: a bare namespace string (locale implied by
  // setRequestLocale) and {locale, namespace} (used for a namespace read ahead of
  // setRequestLocale, e.g. the shared Common breadcrumb label -- see about/page.tsx).
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : ((input.locale ?? translationState.locale) as Locale);
    return (key: string) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") {
        throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      }
      return value;
    };
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("next/navigation", () => ({notFound: notFoundSpy}));
// PageHero's breadcrumb Link and RichRelatedRoutes' Links come from @/i18n/navigation,
// which wraps next-intl's createNavigation -- that pulls in next/navigation exports this
// file's mock above doesn't provide (redirect, usePathname, ...), crashing at module init.
// Mocking @/i18n/navigation directly with a plain anchor sidesteps that, matching the
// convention already used in tests/unit/wt-pages/event-detail-page.test.tsx.
vi.mock("@/i18n/navigation", async () => {
  const {createElement} = await vi.importActual<typeof import("react")>("react");
  return {
    Link: ({children, href, ...props}: {children: ReactNode; href: string}) =>
      createElement("a", {href, ...props}, children),
  };
});
vi.mock("next/image", async () => {
  const {createElement} = await vi.importActual<typeof import("react")>("react");
  return {
    default: ({alt, ...props}: React.ImgHTMLAttributes<HTMLImageElement>) =>
      createElement("img", {alt, ...props}),
  };
});

// Content order, which is the file's own chronological order. The 2001, 2014 and
// 2025 entries were added to the featured set so the homepage archive grid fills
// its four cards from more than one night in 2022; each one also gains a detail
// page and a sitemap entry, which is what this list guards.
const featuredSlugs = [
  "2001-establishment-of-wtia",
  "2014-wi-fi-hk",
  "the-strategies-for-expanding-global-internet-of-things-iot-markets",
  "new-term-of-executive-committee-2022-2024",
  "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
  "asia-smart-innovation-awards-2025",
] as const;
// A milestone-kind record that is deliberately not featured, so it must have no
// detail page, no metadata and a 404.
const unfeaturedSlug = "2002-the-1st-wtia-panel-discussion-inter-operator-sms";
const gallerySlug = "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner";

describe("history detail pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each([
    ["en", en],
    ["zh-HK", zh],
  ] as const)("pins the %s structural story heading in the message bundle", (locale, messages) => {
    expect((messages.History as {storyTitle: string}).storyTitle).toBe(approvedStoryTitle[locale]);
  });

  it("generates exactly the six pinned featured milestone params in content order", () => {
    expect(generateStaticParams()).toEqual(featuredSlugs.map((slug) => ({slug})));
  });

  it("every generated slug resolves to its pinned milestone record", () => {
    for (const {slug} of generateStaticParams()) {
      expect(findBySlug(milestones, slug)?.slug).toBe(slug);
    }
  });

  it("generates no param for member stories, press releases, or non-featured milestones", () => {
    const generated = new Set(generateStaticParams().map(({slug}) => slug));
    const excluded = milestones.filter(({kind, featured}) => kind !== "milestone" || !featured);

    expect(excluded.length).toBeGreaterThan(0);
    for (const entry of excluded) expect(generated.has(entry.slug), entry.slug).toBe(false);
  });

  it.each([
    ["en", "WTIA \"20+1st\" Anniversary celebration and Inauguration Gala Dinner"],
    ["zh-HK", "WTIA「20+1週年」慶祝晚宴暨就職典禮"],
  ] as const)("renders one editorial story and the record gallery in %s", async (locale, title) => {
    const milestone = findBySlug(milestones, gallerySlug);
    expect(milestone).not.toBeNull();
    if (!milestone) return;

    render(await HistoryDetailPage({params: Promise.resolve({locale, slug: gallerySlug})}));

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: title})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual([
      approvedStoryTitle[locale],
    ]);
    expect(screen.queryByRole("heading", {level: 2, name: title})).not.toBeInTheDocument();

    const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;
    for (const paragraph of body.split("\n\n")) {
      expect(screen.getAllByText(paragraph)).toHaveLength(1);
    }

    const gallery = screen.getByRole("list");
    const images = within(gallery).getAllByRole("img");
    expect(images.map((image) => image.getAttribute("alt"))).toEqual(
      milestone.images.map((image) => locale === "zh-HK" ? image.altZh : image.altEn),
    );
    expect(images.map((image) => image.getAttribute("src"))).toEqual(
      milestone.images.map(({src}) => src),
    );
    for (const image of images) {
      expect(image).toHaveAttribute("width", "960");
      expect(image).toHaveAttribute("height", "640");
      expect(image).toHaveAttribute("sizes", "(min-width: 768px) 50vw, 100vw");
    }
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  // Until 2001/2014/2025 were featured, every featured record had a multi-paragraph
  // body, so the single-paragraph path had never rendered. Its whole body is the hero
  // lead, leaving the story section with only the gallery to show -- and it must not
  // print the lead twice or head an empty container.
  it("renders a single-paragraph milestone once, in the hero, with the gallery still shown", async () => {
    const milestone = findBySlug(milestones, "2001-establishment-of-wtia");
    expect(milestone).not.toBeNull();
    if (!milestone) return;
    expect(milestone.bodyEn).not.toContain("\n\n");
    expect(milestone.images.length).toBeGreaterThan(0);

    render(await HistoryDetailPage({params: Promise.resolve({locale: "en", slug: milestone.slug})}));

    expect(screen.getAllByText(milestone.bodyEn)).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 2, name: approvedStoryTitle.en})).toBeVisible();
    expect(within(screen.getByRole("list")).getAllByRole("img")).toHaveLength(milestone.images.length);
  });

  it("preserves exact localized metadata inputs and returns empty metadata for a disallowed slug", async () => {
    const milestone = findBySlug(milestones, gallerySlug);
    expect(milestone).not.toBeNull();
    if (!milestone) return;

    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const title = locale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
      const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;
      // D-1: a record title carries no suffix of its own, so the page brands it at runtime.
      const expected = {
        locale,
        pathname: `/about/history/${gallerySlug}`,
        title: brandedTitle(locale, title),
        description: body.slice(0, 160),
      };

      expect(await generateMetadata({params: Promise.resolve({locale, slug: gallerySlug})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
      expect(expected.title.endsWith(locale === "zh-HK" ? "｜WiseTech Hong Kong" : " | WiseTech Hong Kong")).toBe(true);
    }

    buildPageMetadataSpy.mockClear();
    expect(await generateMetadata({
      params: Promise.resolve({locale: "en", slug: unfeaturedSlug}),
    })).toEqual({});
    expect(buildPageMetadataSpy).not.toHaveBeenCalled();
  });

  it("404s direct requests for non-milestone, non-featured, and unknown slugs", async () => {
    const memberStory = milestones.find(({kind}) => kind === "member-story");
    const pressRelease = milestones.find(({kind}) => kind === "press-release");
    expect(memberStory).toBeDefined();
    expect(pressRelease).toBeDefined();

    for (const slug of [
      memberStory!.slug,
      pressRelease!.slug,
      unfeaturedSlug,
      "unknown-history-record",
    ]) {
      notFoundSpy.mockClear();
      await expect(HistoryDetailPage({params: Promise.resolve({locale: "en", slug})})).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(notFoundSpy).toHaveBeenCalledExactlyOnceWith();
      expect(setRequestLocaleSpy).not.toHaveBeenCalled();
    }
  });

  // The 20+1 anniversary record shipped as a verbatim scrape of its own 2022
  // announcement -- future tense, "*Seats Limited", ticket prices and a live
  // registration URL -- and a featured record is a published one, so it sat on the
  // homepage archive card and its own detail page inviting readers to a dinner that
  // had happened four years earlier. Featured bodies carry the guard because those
  // are the ones with a public page.
  it("publishes no live event-registration copy in a featured milestone body", () => {
    const registrationLink = /jotform\.com|lnkd\.in|eventbrite|forms\.gle|docs\.google\.com\/forms/i;
    const ticketPrice = /(?:HKD?|US)?\$\s?[\d,]+(?:\.\d{2})?/;
    const featured = milestones.filter(({featured: isFeatured}) => isFeatured);

    expect(featured.length).toBeGreaterThan(0);
    for (const {slug, bodyEn, bodyZh} of featured) {
      for (const [locale, body] of [["en", bodyEn], ["zh-HK", bodyZh]] as const) {
        expect(registrationLink.test(body), `${slug} (${locale}) registration link`).toBe(false);
        expect(ticketPrice.test(body), `${slug} (${locale}) ticket price`).toBe(false);
      }
    }
  });

  it("keeps the detail route server-only, composed from PageHero, RichCompass and MediaGallery", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/[slug]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("MediaGallery");
    expect(source).not.toContain("InstitutionalPageIntro");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
    expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
  });
});
