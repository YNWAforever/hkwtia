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
  const state = {
    locale: "en" as Locale,
    messages: {} as Record<string, Record<string, unknown>>,
  };
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
    const locale = typeof input === "string"
      ? translationState.locale
      : (input.locale ?? translationState.locale);
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

vi.mock("next/image", () => ({
  default: ({alt, ...props}: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

const approved = {
  en: {
    about: {
      metaTitle: "About WTIA",
      metaDescription: "Learn about WTIA's role in Hong Kong's wireless technology community.",
      title: "A connected voice for wireless technology.",
      historyTitle: "Our role",
      foundedTitle: "Established 2001",
      foundedBody: "WTIA is a not-for-profit trade association founded in 2001 for Hong Kong's wireless, mobile and emerging technology community.",
      missionTitle: "Our mission",
      missionBody: "To advance wireless, mobile and emerging technologies, accelerate their real-world adoption, and help shape Hong Kong into a top-class innovation and technology hub.",
      imageAlt: "Hong Kong technology community",
      historyLink: "Read our history",
      roles: [
        ["Connect the ecosystem", "Create practical links among members, partners, investors and markets."],
        ["Advance innovation", "Support programmes that help technology teams learn, demonstrate and grow."],
        ["Represent the industry", "Bring sector experience into constructive public and industry dialogue."],
      ],
    },
    chairman: {
      metaTitle: "Chairman's Message | WTIA",
      metaDescription: "A message from the WTIA chairman.",
      title: "Chairman's message",
      messageTitle: "A shared commitment",
      message: "Our association is strongest when members contribute experience, curiosity and a willingness to collaborate. WTIA will continue creating practical bridges between innovation and opportunity.",
      signature: "Chairman, WTIA",
    },
    committees: {
      metaTitle: "Committees | WTIA",
      metaDescription: "How WTIA committees support governance, programmes and members.",
      title: "Committees that turn participation into action.",
      structureTitle: "Committee structure",
      items: [
        ["Executive Committee", "Guides strategy, governance and association priorities."],
        ["Innovation Committee", "Shapes programmes around technology adoption and industry development."],
        ["Membership Committee", "Strengthens member value, participation and community connections."],
      ],
    },
  },
  "zh-HK": {
    about: {
      metaTitle: "關於 WTIA",
      metaDescription: "了解 WTIA 在香港無線科技社群的角色。",
      title: "凝聚無線科技業界的共同力量。",
      historyTitle: "我們的角色",
      foundedTitle: "成立於2001年",
      foundedBody: "香港無線科技商會（WTIA）成立於2001年，是一個非牟利貿易協會，服務香港無線、流動及新興科技社群。",
      missionTitle: "我們的使命",
      missionBody: "推動無線、流動及新興科技發展，加速其實際應用，協助香港發展成為頂尖創科樞紐。",
      imageAlt: "香港創科社群",
      historyLink: "閱讀我們的歷史",
      roles: [
        ["連接生態", "連繫會員、夥伴、投資者及市場。"],
        ["推動創新", "以計劃支援科技團隊學習、展示及成長。"],
        ["代表業界", "把業界經驗帶進具建設性的公共及產業對話。"],
      ],
    },
    chairman: {
      metaTitle: "主席的話｜WTIA",
      metaDescription: "WTIA 主席的話。",
      title: "主席的話",
      messageTitle: "共同承諾",
      message: "會員分享經驗、保持好奇並積極合作，是本會最重要的力量。WTIA 將繼續在創新與機遇之間建立實際橋樑。",
      signature: "WTIA 主席",
    },
    committees: {
      metaTitle: "委員會｜WTIA",
      metaDescription: "了解 WTIA 委員會如何支援管治、計劃及會員。",
      title: "把參與轉化為行動的委員會。",
      structureTitle: "委員會架構",
      items: [
        ["執行委員會", "領導策略、管治及協會優先工作。"],
        ["創新委員會", "就科技應用及業界發展策劃計劃。"],
        ["會員委員會", "提升會員價值、參與及社群連繫。"],
      ],
    },
  },
} as const;

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

async function renderAbout(locale: Locale) {
  const {default: Page} = await import("@/app/[locale]/(public)/about/page");
  renderWithIntl(locale, await Page({params: Promise.resolve({locale})}));
}

async function renderChairman(locale: Locale) {
  const {default: Page} = await import("@/app/[locale]/(public)/about/chairman/page");
  renderWithIntl(locale, await Page({params: Promise.resolve({locale})}));
}

async function renderCommittees(locale: Locale) {
  const {default: Page} = await import("@/app/[locale]/(public)/about/committees/page");
  renderWithIntl(locale, await Page({params: Promise.resolve({locale})}));
}

describe("institutional pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each([
    ["en", "/about/history"],
    ["zh-HK", "/zh/about/history"],
  ] as const)("renders the approved About story and real localized history Link in %s", async (locale, historyHref) => {
    const expected = approved[locale].about;
    await renderAbout(locale);

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual([
      expected.historyTitle,
      expected.foundedTitle,
    ]);
    expect(screen.getByRole("img", {name: expected.imageAlt})).toHaveAttribute("src", "/images/about-hero.jpg");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("heading", {level: 3}).map(({textContent}) => textContent)).toEqual([
      ...expected.roles.map(([title]) => title),
      expected.missionTitle,
    ]);
    for (const [, description] of expected.roles) expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByText(expected.foundedBody)).toBeVisible();
    expect(screen.getByText(expected.missionBody)).toBeVisible();
    expect(screen.getByRole("link", {name: expected.historyLink})).toHaveAttribute("href", historyHref);
    expect(document.querySelector('a[href^="/zh/zh"]')).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it.each(["en", "zh-HK"] as const)("renders only the approved unattributed Chairman message in %s", async (locale) => {
    const expected = approved[locale].chairman;
    await renderChairman(locale);

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual([expected.messageTitle]);
    const quote = screen.getByRole("blockquote");
    expect(within(quote).getByText(expected.message)).toBeVisible();
    expect(within(quote).getByText(expected.signature).tagName).toBe("CITE");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it.each(["en", "zh-HK"] as const)("renders exactly the three approved committee descriptions in %s", async (locale) => {
    const expected = approved[locale].committees;
    await renderCommittees(locale);

    expect(setRequestLocaleSpy).toHaveBeenCalledExactlyOnceWith(locale);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: expected.title})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 2}).map(({textContent}) => textContent)).toEqual([expected.structureTitle]);
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(3);
    expect(screen.getAllByRole("heading", {level: 3}).map(({textContent}) => textContent)).toEqual(
      expected.items.map(([title]) => title),
    );
    expect(articles.map((article) => article.textContent)).toEqual(
      expected.items.map(([title, description]) => `${title}${description}`),
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it.each([
    ["about", () => import("@/app/[locale]/(public)/about/page"), "/about", "/images/about-hero.jpg"],
    ["chairman", () => import("@/app/[locale]/(public)/about/chairman/page"), "/about/chairman", undefined],
    ["committees", () => import("@/app/[locale]/(public)/about/committees/page"), "/about/committees", undefined],
  ] as const)("preserves exact %s metadata inputs", async (route, load, pathname, image) => {
    for (const locale of ["en", "zh-HK"] as const) {
      buildPageMetadataSpy.mockClear();
      const routeCopy = approved[locale][route];
      const expected = {
        locale,
        pathname,
        title: routeCopy.metaTitle,
        description: routeCopy.metaDescription,
        ...(image ? {image} : {}),
      };
      const {generateMetadata} = await load();

      expect(await generateMetadata({params: Promise.resolve({locale})})).toEqual(expected);
      expect(buildPageMetadataSpy).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it("keeps all three routes server-only and exclusively on the PR3 institutional primitives", () => {
    for (const file of [
      "app/[locale]/(public)/about/page.tsx",
      "app/[locale]/(public)/about/chairman/page.tsx",
      "app/[locale]/(public)/about/committees/page.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("InstitutionalPageIntro");
      expect(source).toContain("StorySection");
      expect(source).not.toContain("PageHero");
      expect(source).not.toContain("FeatureGrid");
      expect(source).not.toContain("@/components/marketing/section");
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
      expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
    }
  });
});
