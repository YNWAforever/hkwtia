import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import {Children, isValidElement, type ReactElement, type ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import type {MilestoneRecord} from "@/content/schemas";
import {byYearDescending, featuredOnly, milestonesOnly} from "@/lib/history/milestones";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const approvedHistory = {
  en: {
    metaTitle: "History | WTIA",
    metaDescription: "Twenty-five years of the Hong Kong Wireless Technology Industry Association, 2001 to 2025.",
    eyebrow: "Since 2001",
    title: "Our history",
    intro: "Milestones from twenty-five years of building Hong Kong's wireless and technology industry.",
  },
  "zh-HK": {
    metaTitle: "歷史｜WTIA",
    metaDescription: "香港無線科技商會二十五年歷程，由2001年至2025年。",
    eyebrow: "自2001年",
    title: "我們的歷史",
    intro: "回顧香港無線及科技產業二十五年來的發展里程碑。",
  },
} as const;

const {buildPageMetadataSpy, setRequestLocaleSpy, translationState} = vi.hoisted(() => {
  const state = {
    locale: "en" as Locale,
    messages: {} as Record<Locale, Record<string, unknown>>,
  };
  return {
    buildPageMetadataSpy: vi.fn((input: unknown) => input),
    setRequestLocaleSpy: vi.fn((locale: string) => {
      state.locale = locale as Locale;
    }),
    translationState: state,
  };
});

function milestone(overrides: Partial<MilestoneRecord>): MilestoneRecord {
  return {
    slug: "x", year: 2010, month: "01", kind: "milestone",
    titleEn: "Title EN", titleZh: "標題", bodyEn: "Body EN", bodyZh: "正文",
    images: [], legacyPath: "/2010/01/x/", featured: false,
    ...overrides,
  } as MilestoneRecord;
}

function renderWithIntl(locale: Locale, element: ReactElement) {
  return render(
    <NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>,
  );
}

describe("milestone timeline", () => {
  it("renders the requested locale only", () => {
    renderWithIntl("zh-HK",
      <MilestoneTimeline locale="zh-HK" readMoreLabel="更多" milestones={[milestone({})]} />,
    );
    expect(screen.getByText("標題")).toBeVisible();
    expect(screen.queryByText("Title EN")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Two sentences only.", "Featured body.", "/about/history/long"],
    ["zh-HK", "只有兩句。", "專題正文。", "/zh/about/history/long"],
  ] as const)("renders a non-featured body inline and the featured locale-aware link only in %s", (
    locale,
    inlineBody,
    featuredBody,
    featuredHref,
  ) => {
    renderWithIntl(locale,
      <MilestoneTimeline locale={locale} readMoreLabel={locale === "en" ? "Read more" : "閱讀更多"} milestones={[
        milestone({
          slug: "short",
          titleEn: "Short one",
          titleZh: "短篇",
          bodyEn: "Two sentences only.",
          bodyZh: "只有兩句。",
        }),
        milestone({
          slug: "long",
          featured: true,
          titleEn: "Long one",
          titleZh: "長篇",
          bodyEn: "Featured body.",
          bodyZh: "專題正文。",
        }),
      ]} />,
    );

    expect(screen.getByText(inlineBody)).toBeVisible();
    expect(screen.queryByText(featuredBody)).not.toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", featuredHref);
    expect(document.querySelector('a[href$="/about/history/short"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/zh/zh"]')).not.toBeInTheDocument();
  });

  it("renders year headings newest first without empty years", () => {
    renderWithIntl("en",
      <MilestoneTimeline locale="en" readMoreLabel="Read more" milestones={[
        milestone({slug: "a", year: 2003}), milestone({slug: "b", year: 2016}),
      ]} />,
    );

    expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual([
      "2016",
      "2003",
    ]);
    expect(screen.queryByRole("heading", {level: 2, name: "2004"})).not.toBeInTheDocument();
  });

  it("pins the current factual count, year order, and three featured destinations", async () => {
    const actual = await vi.importActual<typeof import("@/content/milestones")>("@/content/milestones");
    const history = milestonesOnly(actual.milestones);

    expect(actual.milestones).toHaveLength(61);
    expect(history).toHaveLength(51);
    expect(byYearDescending(history).map(({year}) => year)).toEqual([
      2025, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
      2014, 2013, 2007, 2006, 2005, 2003, 2002, 2001,
    ]);
    expect(featuredOnly(history).map(({slug}) => slug)).toEqual([
      "the-strategies-for-expanding-global-internet-of-things-iot-markets",
      "new-term-of-executive-committee-2022-2024",
      "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
    ]);
  });
});

// The page owns the kind filter (see lib/history/milestones#milestonesOnly);
// MilestoneTimeline stays a dumb renderer. Checking that seam means reading
// what the page actually hands the component.
const fixture = vi.hoisted(() => ({
  milestones: [
    {
      slug: "a-real-milestone", year: 2010, month: "01", kind: "milestone",
      titleEn: "Real milestone", titleZh: "真實里程碑", bodyEn: "Body EN", bodyZh: "正文",
      images: [], legacyPath: "/2010/01/a-real-milestone/", featured: false,
    },
    {
      slug: "a-member-story", year: 2011, month: "02", kind: "member-story",
      titleEn: "Meet our member", titleZh: "會員專訪", bodyEn: "Body EN", bodyZh: "正文",
      images: [], legacyPath: "/2011/02/a-member-story/", featured: false,
    },
    {
      slug: "a-press-release", year: 2012, month: "03", kind: "press-release",
      titleEn: "Vendor announcement", titleZh: "業界公告", bodyEn: "Body EN", bodyZh: "正文",
      images: [], legacyPath: "/2012/03/a-press-release/", featured: false,
    },
  ],
}));

vi.mock("@/content/milestones", () => ({milestones: fixture.milestones}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string"
      ? translationState.locale
      : (input.locale ?? translationState.locale) as Locale;
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

function findMilestoneTimeline(
  root: ReactElement<{children?: ReactNode}>,
): ReactElement<{milestones: readonly MilestoneRecord[]}> | undefined {
  let found: ReactElement<{milestones: readonly MilestoneRecord[]}> | undefined;
  Children.forEach(root.props.children, (child) => {
    if (isValidElement(child) && child.type === MilestoneTimeline) {
      found = child as ReactElement<{milestones: readonly MilestoneRecord[]}>;
    }
  });
  return found;
}

describe("history page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("passes the timeline only kind: milestone entries", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    const page = await HistoryPage({params: Promise.resolve({locale: "en"})});

    const timeline = findMilestoneTimeline(page);
    expect(timeline).toBeDefined();
    expect(timeline?.props.milestones.map(({slug}) => slug)).toEqual(["a-real-milestone"]);
  });

  it.each(["en", "zh-HK"] as const)(
    "uses the pinned %s History strings in one institutional intro before the timeline",
    async (locale) => {
      const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
      const page = await HistoryPage({params: Promise.resolve({locale})});
      renderWithIntl(locale, page);

      const expected = approvedHistory[locale];
      expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
      expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
      expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
      expect(screen.getByText(expected.eyebrow)).toBeVisible();
      expect(screen.getByText(expected.intro)).toBeVisible();
      expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual(["2010"]);
      expect(screen.getByText(locale === "en" ? "Body EN" : "正文")).toBeVisible();
      expect(document.querySelector("main")).not.toBeInTheDocument();
    },
  );

  it("preserves exact localized list metadata inputs without adding an image", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/about/history/page");

    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const expected = {
        locale,
        pathname: "/about/history",
        title: approvedHistory[locale].metaTitle,
        description: approvedHistory[locale].metaDescription,
      };

      expect(await generateMetadata({params: Promise.resolve({locale})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it("keeps the list route and timeline server-only on the new presentation primitive", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/page.tsx"),
      "utf8",
    );
    const timelineSource = readFileSync(
      resolve(process.cwd(), "components/marketing/milestone-timeline.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("InstitutionalPageIntro");
    expect(pageSource).not.toContain("PageHero");
    for (const source of [pageSource, timelineSource]) {
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
      expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
    }
  });
});
