import {NextIntlClientProvider} from "next-intl";
import {Children, isValidElement, type ReactElement, type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import type {MilestoneRecord} from "@/content/schemas";

function milestone(overrides: Partial<MilestoneRecord>): MilestoneRecord {
  return {
    slug: "x", year: 2010, month: "01", kind: "milestone",
    titleEn: "Title EN", titleZh: "標題", bodyEn: "Body EN", bodyZh: "正文",
    images: [], legacyPath: "/2010/01/x/", featured: false,
    ...overrides,
  } as MilestoneRecord;
}

// `Link` from @/i18n/navigation calls use-intl's `useLocale()` unconditionally
// -- even when an explicit `locale` prop is passed, see next-intl's BaseLink --
// so any render that can reach a featured entry's Link needs a real intl
// context. next-intl's own type docs for NextIntlClientProvider name this
// exact case: "e.g. when rendered from ... a unit test ... you can pass this
// prop explicitly."
function renderWithIntl(locale: "en" | "zh-HK", element: ReactElement) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>,
  );
}

describe("milestone timeline", () => {
  it("renders the requested locale only", () => {
    const html = renderWithIntl("zh-HK",
      <MilestoneTimeline locale="zh-HK" readMoreLabel="更多" milestones={[milestone({})]} />,
    );
    expect(html).toContain("標題");
    expect(html).not.toContain("Title EN");
  });

  it("renders a short entry's body inline and links a featured one out", () => {
    const html = renderWithIntl("en",
      <MilestoneTimeline locale="en" readMoreLabel="Read more" milestones={[
        milestone({slug: "short", bodyEn: "Two sentences only."}),
        milestone({slug: "long", featured: true, titleEn: "Long one"}),
      ]} />,
    );
    expect(html).toContain("Two sentences only.");
    expect(html).toContain("/about/history/long");
    expect(html).not.toContain("/about/history/short");
  });

  it("groups by year without emitting empty years", () => {
    const html = renderWithIntl("en",
      <MilestoneTimeline locale="en" readMoreLabel="Read more" milestones={[
        milestone({slug: "a", year: 2003}), milestone({slug: "b", year: 2016}),
      ]} />,
    );
    expect(html).toContain("2016");
    expect(html).toContain("2003");
    expect(html).not.toContain("2004");
  });
});

// The page owns the kind filter (see lib/history/milestones#milestonesOnly);
// MilestoneTimeline stays a dumb renderer. Checking that seam means reading
// what the page actually hands the component -- not rendering the full
// App Router page, which needs request-scoped next-intl config this unit
// test has no reason to fake beyond the two functions the page body calls.
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
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));

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
  it("passes the timeline only kind: milestone entries", async () => {
    const {default: HistoryPage} = await import("@/app/[locale]/(public)/about/history/page");
    const page = await HistoryPage({params: Promise.resolve({locale: "en"})});

    const timeline = findMilestoneTimeline(page);
    expect(timeline).toBeDefined();
    expect(timeline?.props.milestones.map(({slug}) => slug)).toEqual(["a-real-milestone"]);
  });
});
