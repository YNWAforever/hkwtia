import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import {Children, isValidElement, type ReactElement, type ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import type {MilestoneRecord} from "@/content/schemas";
import {byYearDescending, featuredOnly, findBySlug, milestonesOnly} from "@/lib/history/milestones";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type Locale = "en" | "zh-HK";

const approvedHistory = {
  en: {
    metaTitle: "History | WTIA",
    metaDescription: "Twenty-six years of the Hong Kong Wireless Technology Industry Association, 2001 to 2026.",
    eyebrow: "Since 2001",
    title: "Our history",
    intro: "Milestones from twenty-six years of building Hong Kong's wireless and technology industry.",
  },
  "zh-HK": {
    metaTitle: "歷史｜WTIA",
    metaDescription: "香港無線科技商會二十六年歷程，由2001年至2026年。",
    eyebrow: "自2001年",
    title: "我們的歷史",
    intro: "回顧香港無線及科技產業二十六年來的發展里程碑。",
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

  // The full bodies inline made /about/history 36,000px on a phone (two records run 6,500 and
  // 9,300 characters). A long or multi-paragraph record previews its lead and links on.
  it("previews a long non-featured body with its lead only and a locale-aware link", () => {
    const lead = "A".repeat(200);
    const rest = "Second paragraph that belongs on the record page.";
    renderWithIntl("zh-HK",
      <MilestoneTimeline locale="zh-HK" readMoreLabel="閱讀更多" milestones={[
        milestone({slug: "multi", bodyZh: `${lead}\n\n${rest}`}),
        milestone({slug: "one-long", bodyZh: "B".repeat(400)}),
      ]} />,
    );

    expect(screen.getByText(lead)).toHaveClass("line-clamp-3");
    expect(screen.queryByText(rest)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", {name: "閱讀更多"}).map((a) => a.getAttribute("href")))
      .toEqual(["/zh/about/history/multi", "/zh/about/history/one-long"]);
  });

  it("weighs Chinese characters by their width and skips a lead that only repeats the title", () => {
    const echo = "Pandemic Deals Heavy Blow to IT SMEs";
    const substance = "The industry asked for direct funding and a meeting with the Bureau.";
    renderWithIntl("zh-HK",
      <MilestoneTimeline locale="zh-HK" readMoreLabel="閱讀更多" milestones={[
        // 150 CJK characters: under a raw-length limit, but ten lines on a phone.
        milestone({slug: "dense", bodyZh: "會".repeat(150)}),
        milestone({slug: "echo", titleZh: `[Press Release] ${echo}`, bodyZh: `[PRESS RELEASE]\n\n${echo}\n\n${substance}`}),
      ]} />,
    );

    expect(document.querySelector('a[href="/zh/about/history/dense"]')).toBeInTheDocument();
    expect(screen.getByText(substance)).toHaveClass("line-clamp-3");
    expect(screen.queryByText(echo)).not.toBeInTheDocument();
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

  // Round 24 (owner decision 2026-10-10): 68 milestones over 17 years made /about/history the
  // longest page on a phone (17,454px). The three newest years stay open; each older year is one
  // native <details> row — year and count — whose entries stay in the HTML for search and find.
  it("keeps the three newest years open and folds each older year behind its year and count", () => {
    renderWithIntl("en",
      <MilestoneTimeline locale="en" readMoreLabel="Read more" countLabel={(count) => `${count} milestones`} milestones={[
        milestone({slug: "y25", year: 2025, titleEn: "In 2025"}), milestone({slug: "y22", year: 2022, titleEn: "In 2022"}),
        milestone({slug: "y21", year: 2021, titleEn: "In 2021"}), milestone({slug: "y20a", year: 2020, titleEn: "In 2020 A"}),
        milestone({slug: "y20b", year: 2020, titleEn: "In 2020 B"}), milestone({slug: "y05", year: 2005, titleEn: "In 2005"}),
      ]} />,
    );

    for (const year of ["2025", "2022", "2021"]) {
      expect(screen.getByRole("heading", {level: 2, name: year}).closest("details")).toBeNull();
    }
    const folded = [...document.querySelectorAll("details")];
    expect(folded).toHaveLength(2);
    expect(folded.every((details) => !details.open)).toBe(true);
    expect(folded[0].querySelector("summary")?.textContent).toContain("2020");
    expect(folded[0].querySelector("summary")?.textContent).toContain("2 milestones");
    expect(folded[1].querySelector("summary")?.textContent).toContain("1 milestones");
    expect(screen.getByRole("heading", {level: 2, name: "2020"}).closest("summary")).not.toBeNull();
    for (const title of ["In 2020 A", "In 2020 B", "In 2005"]) expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("pins the current factual count, year order, and three featured destinations", async () => {
    const actual = await vi.importActual<typeof import("@/content/milestones")>("@/content/milestones");
    const history = milestonesOnly(actual.milestones);

    // 51 archive milestones plus four ready records from Alice v5: ASA 2021,
    // the 2022/23 Awards, Tech to Connect 2026 kick-off, and the 2026 workshops.
    expect(actual.milestones).toHaveLength(65);
    expect(history).toHaveLength(55);
    expect(byYearDescending(history).map(({year}) => year)).toEqual([
      2026, 2025, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
      2014, 2013, 2007, 2006, 2005, 2003, 2002, 2001,
    ]);
    // Willy 2026-10-31: these three only, in content order. Each has a photo.
    expect(featuredOnly(history).map(({slug}) => slug)).toEqual([
      "2023-asia-smart-app-awards-2022-23",
      "asia-smart-innovation-awards-2025",
      "2026-tech-to-connect-2026-kick-off",
    ]);
    for (const slug of featuredOnly(history).map(({slug: featuredSlug}) => featuredSlug)) {
      expect(findBySlug(history, slug)?.images.length, slug).toBeGreaterThan(0);
    }

    const notFeatured = [
      "2001-establishment-of-wtia",
      "2014-wi-fi-hk",
      "the-strategies-for-expanding-global-internet-of-things-iot-markets",
      "new-term-of-executive-committee-2022-2024",
      "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
      "2021-asia-smart-app-awards-8th",
      "2026-tech-to-connect-2026-workshop-series",
    ];
    for (const slug of notFeatured) {
      expect(findBySlug(history, slug)?.featured, slug).toBe(false);
    }
    expect(history.some((milestone) => milestone.year === 2026 && /chair|主席|會長/i.test(`${milestone.slug} ${milestone.titleEn} ${milestone.titleZh}`))).toBe(false);

    const asa2021 = findBySlug(history, "2021-asia-smart-app-awards-8th");
    expect(asa2021).toMatchObject({
      year: 2022,
      month: "06",
      titleEn: "Asia Smart App Awards 2021",
      titleZh: "亞洲智能應用程式大獎 2021",
      featured: false,
      legacyPath: null,
    });
    expect(asa2021?.bodyEn).toContain("The award ceremony was held on 23 June 2022.");
    expect(asa2021?.bodyEn).toContain("Organised the 8th edition of Asia Smart App Awards.");
    expect(asa2021?.bodyZh).toContain("頒獎典禮於 2022 年 6 月 23 日舉行。");
    expect(asa2021?.bodyZh).toContain("舉辦第8屆「亞洲智能應用程式大獎」");

    const awards = findBySlug(history, "2023-asia-smart-app-awards-2022-23");
    expect(awards).toMatchObject({year: 2023, month: "06", featured: true});
    expect(awards?.bodyEn).toContain("Eight teams reached the final");
    expect(awards?.bodyZh).toContain("決賽隊數待核實");

    const asia = findBySlug(history, "asia-smart-innovation-awards-2025");
    expect(asia?.bodyEn).toContain("then-Chairman (now Honorary Chairman) Mr Keith Li");
    expect(asia?.bodyZh).toContain("時任主席（現任榮譽主席）李勁華先生");
    expect(asia?.bodyEn).not.toContain("historic high");
    expect(asia?.bodyZh).not.toContain("規模創下歷年之最");
    expect(asia?.images.map(({src}) => src)).not.toContain(
      "/images/history/562333706_1252562953570355_3640544314971024985_n-3-1.jpg",
    );
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
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace?: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string"
      ? translationState.locale
      : (input.locale ?? translationState.locale) as Locale;
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
    "uses the pinned %s History strings across the hero and compass, before the timeline",
    async (locale) => {
      const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
      const page = await HistoryPage({params: Promise.resolve({locale})});
      renderWithIntl(locale, page);

      const expected = approvedHistory[locale];
      expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
      expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
      expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
      expect(screen.getAllByText(expected.eyebrow).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(expected.intro)).toBeVisible();
      expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual(["2010"]);
      expect(screen.getByText(locale === "en" ? "Body EN" : "正文")).toBeVisible();
      expect(document.querySelectorAll(".rich-compass-grid>div")).toHaveLength(3);
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

  it("keeps the list route and timeline server-only on the RichPage shell", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/about/history/page.tsx"),
      "utf8",
    );
    const timelineSource = readFileSync(
      resolve(process.cwd(), "components/marketing/milestone-timeline.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("PageHero");
    expect(pageSource).toContain("RichCompass");
    expect(pageSource).not.toContain("InstitutionalPageIntro");
    for (const source of [pageSource, timelineSource]) {
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
      expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
    }
  });
});
