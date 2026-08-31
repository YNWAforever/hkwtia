import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {
  default as HistoryDetailPage,
  generateMetadata,
  generateStaticParams,
} from "@/app/[locale]/(public)/about/history/[slug]/page";
import {milestones} from "@/content/milestones";
import {findBySlug} from "@/lib/history/milestones";
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

vi.mock("@/lib/metadata", () => ({buildPageMetadata: buildPageMetadataSpy}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => {
    let value: unknown = translationState.messages[translationState.locale]?.[namespace];
    for (const part of key.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
    if (typeof value !== "string") {
      throw new Error(`Missing test message: ${translationState.locale}.${namespace}.${key}`);
    }
    return value;
  }),
  setRequestLocale: setRequestLocaleSpy,
}));
vi.mock("next/navigation", () => ({notFound: notFoundSpy}));
vi.mock("next/image", async () => {
  const {createElement} = await vi.importActual<typeof import("react")>("react");
  return {
    default: ({alt, ...props}: React.ImgHTMLAttributes<HTMLImageElement>) =>
      createElement("img", {alt, ...props}),
  };
});

const featuredSlugs = [
  "the-strategies-for-expanding-global-internet-of-things-iot-markets",
  "new-term-of-executive-committee-2022-2024",
  "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
] as const;
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
    expect((messages.History as Record<string, string>).storyTitle).toBe(approvedStoryTitle[locale]);
  });

  it("generates exactly the three pinned featured milestone params in content order", () => {
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

  it("preserves exact localized metadata inputs and returns empty metadata for a disallowed slug", async () => {
    const milestone = findBySlug(milestones, gallerySlug);
    expect(milestone).not.toBeNull();
    if (!milestone) return;

    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const title = locale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
      const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;
      const expected = {
        locale,
        pathname: `/about/history/${gallerySlug}`,
        title,
        description: body.slice(0, 160),
      };

      expect(await generateMetadata({params: Promise.resolve({locale, slug: gallerySlug})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
    }

    buildPageMetadataSpy.mockClear();
    expect(await generateMetadata({
      params: Promise.resolve({locale: "en", slug: "2001-establishment-of-wtia"}),
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
      "2001-establishment-of-wtia",
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

  it("keeps the detail route server-only and composed from all three Task 4 primitives", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/[slug]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("InstitutionalPageIntro");
    expect(source).toContain("StorySection");
    expect(source).toContain("MediaGallery");
    expect(source).not.toContain('from "next/image"');
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
    expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
  });
});
