import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import type {HomeHighlights} from "@/lib/home/home-highlights";

const translationState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-HK",
  messages: {} as Record<string, Record<string, unknown>>,
}));

const loadHomeHighlights = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string"
      ? translationState.locale
      : (input.locale ?? translationState.locale);
    return (key: string) => {
      let value: unknown = translationState.messages[locale]?.[namespace];
      for (const part of key.split(".")) {
        value = (value as Record<string, unknown> | undefined)?.[part];
      }
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return value;
    };
  }),
  setRequestLocale: vi.fn((locale: "en" | "zh-HK") => {
    translationState.locale = locale;
  }),
}));

vi.mock("next/image", () => ({
  default: ({alt, fill, priority, sizes, src, ...props}: {
    alt: string;
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
    src: string;
  }) => {
    void fill;
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} data-priority={priority ? "true" : undefined} sizes={sizes} src={src} {...props} />;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => {
    const localizedHref = translationState.locale === "zh-HK" && href.startsWith("/")
      ? `/zh${href}`
      : href;
    return <a href={localizedHref} {...props}>{children}</a>;
  },
}));

vi.mock("@/lib/home/home-highlights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/home/home-highlights")>();
  return {...actual, loadHomeHighlights};
});

function available(locale: "en" | "zh-HK"): HomeHighlights {
  return {
    event: {
      status: "available",
      item: {
        id: "event-id",
        slug: "repository-event",
        title: locale === "zh-HK" ? "資料庫活動" : "Repository event",
        description: locale === "zh-HK" ? "資料庫活動簡介" : "Repository event summary",
        startsAt: "2026-08-31T16:30:00.000Z",
        endsAt: null,
        venue: "Hong Kong",
        capacity: 80,
        memberOnly: false,
        published: true,
      },
    },
    news: {
      status: "available",
      item: {
        slug: "repository-news",
        titleEn: "Repository news",
        titleZh: "資料庫消息",
        publishedAt: new Date("2026-08-30T16:30:00.000Z"),
        author: "WTIA editorial",
      },
    },
    showcase: {
      status: "available",
      item: {
        slug: "repository-member",
        premium: false,
        goneGlobal: false,
        views: 7,
        memberSince: "2022-01-01",
        name: locale === "zh-HK" ? "資料庫會員方案" : "Repository member solution",
        tagline: locale === "zh-HK" ? "會員方案簡介" : "Member solution summary",
        description: locale === "zh-HK" ? "會員方案內容" : "Member solution description",
        category: "software",
        useCases: ["logistics"],
        deploymentOptions: ["cloud"],
        supportedLanguages: ["en", "zh-HK"],
        worksWith: ["ERP"],
        videoUrl: null,
        caseStudyUrl: null,
        caseStudySummary: null,
        logoReference: null,
        logo: {
          url: "/images/showcase/repository-member.png",
          alt: locale === "zh-HK" ? "資料庫會員標誌" : "Repository member logo",
        },
      },
    },
  };
}

async function renderHome(locale: "en" | "zh-HK", highlights: HomeHighlights) {
  loadHomeHighlights.mockResolvedValueOnce(highlights);
  const {default: HomePage} = await import("@/app/[locale]/(public)/page");
  render(await HomePage({params: Promise.resolve({locale})}));
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each([
    ["en", en.Home, "/events", "/membership", "/events/repository-event", "/news/repository-news", "/showcase/repository-member", "Repository event", "Repository news", "Repository member solution", "September 1, 2026", "August 31, 2026"],
    ["zh-HK", zh.Home, "/zh/events", "/zh/membership", "/zh/events/repository-event", "/zh/news/repository-news", "/zh/showcase/repository-member", "資料庫活動", "資料庫消息", "資料庫會員方案", "2026年9月1日", "2026年8月31日"],
  ] as const)(
    "renders repository highlights and question-led actions in %s",
    async (locale, messages, eventsHref, membershipHref, eventHref, newsHref, showcaseHref, eventTitle, newsTitle, showcaseTitle, eventDate, newsDate) => {
      await renderHome(locale, available(locale));

      expect(screen.getByRole("heading", {level: 1, name: messages.question})).toBeVisible();
      expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
      expect(screen.queryByRole("heading", {level: 1, name: messages.title})).not.toBeInTheDocument();
      expect(screen.getByRole("link", {name: messages.actions.events})).toHaveAttribute("href", eventsHref);
      expect(screen.getByRole("link", {name: messages.actions.membership})).toHaveAttribute("href", membershipHref);
      expect(screen.getByRole("link", {name: messages.actions.discover})).toHaveAttribute("href", "#home-discover");

      const hero = screen.getByRole("img", {name: messages.imageAlt});
      expect(hero).toHaveAttribute("src", "/images/projects-hero.jpg");
      expect(hero).toHaveAttribute("sizes", "100vw");
      expect(hero).toHaveAttribute("data-priority", "true");
      expect(document.querySelector("#home-discover")).toBeInTheDocument();

      expect(screen.getByRole("heading", {level: 3, name: eventTitle})).toBeVisible();
      expect(screen.getByRole("heading", {level: 3, name: newsTitle})).toBeVisible();
      expect(screen.getByRole("heading", {level: 3, name: showcaseTitle})).toBeVisible();
      expect(screen.getByText(eventDate)).toBeVisible();
      expect(screen.getByText(newsDate)).toBeVisible();
      expect(screen.getByText("software")).toBeVisible();
      expect(screen.getByRole("img", {name: locale === "zh-HK" ? "資料庫會員標誌" : "Repository member logo"})).toHaveAttribute("src", "/images/showcase/repository-member.png");
      expect(screen.getByRole("link", {name: messages.highlights.event.view})).toHaveAttribute("href", eventHref);
      expect(screen.getByRole("link", {name: messages.highlights.news.view})).toHaveAttribute("href", newsHref);
      expect(screen.getByRole("link", {name: messages.highlights.showcase.view})).toHaveAttribute("href", showcaseHref);

      expect(screen.queryByText(locale === "zh-HK" ? "服務整個創科生態" : "A platform for the whole ecosystem")).not.toBeInTheDocument();
      expect(screen.queryByText(locale === "zh-HK" ? "重點計劃" : "Flagship programmes")).not.toBeInTheDocument();
      expect(document.querySelector("main")).not.toBeInTheDocument();
      expect(document.querySelector('a[href^="/zh/zh"]')).not.toBeInTheDocument();
      expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"@type":"Organization"');
      expect(loadHomeHighlights).toHaveBeenCalledExactlyOnceWith({locale});
    },
  );

  it.each([
    ["en", en.Home, "/events", "/news", "/showcase"],
    ["zh-HK", zh.Home, "/zh/events", "/zh/news", "/zh/showcase"],
  ] as const)("renders localized empty and unavailable states without placeholder records in %s", async (locale, messages, eventHref, newsHref, showcaseHref) => {
    await renderHome(locale, {
      event: {status: "empty"},
      news: {status: "unavailable"},
      showcase: {status: "empty"},
    });

    expect(screen.getByText(messages.highlights.event.empty)).toBeVisible();
    expect(screen.getByText(messages.highlights.news.unavailable)).toBeVisible();
    expect(screen.getByText(messages.highlights.showcase.empty)).toBeVisible();
    expect(screen.queryByText(/Repository event|資料庫活動/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Repository news|資料庫消息/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Repository member solution|資料庫會員方案/)).not.toBeInTheDocument();

    const discover = document.querySelector("#home-discover");
    expect(discover).not.toBeNull();
    expect(within(discover as HTMLElement).getByRole("link", {name: messages.highlights.event.view})).toHaveAttribute("href", eventHref);
    expect(within(discover as HTMLElement).getByRole("link", {name: messages.highlights.news.view})).toHaveAttribute("href", newsHref);
    expect(within(discover as HTMLElement).getByRole("link", {name: messages.highlights.showcase.view})).toHaveAttribute("href", showcaseHref);
  });

  it("exports a force-dynamic home route", async () => {
    const home = await import("@/app/[locale]/(public)/page");
    expect(home.dynamic).toBe("force-dynamic");
  });
});
