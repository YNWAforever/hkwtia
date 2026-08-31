import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import type {PartnerProjection} from "@/lib/db/repos/partners";
import type {HomeHighlights} from "@/lib/home/home-highlights";

const translationState = vi.hoisted(() => ({locale: "en" as "en" | "zh-HK", messages: {} as Record<string, Record<string, unknown>>}));
const partnersRepository = vi.hoisted(() => ({listPublished: vi.fn()}));
const loadHomeHighlights = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string) => key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], translationState.messages[locale]?.[namespace]) as string;
  }),
  setRequestLocale: vi.fn((locale: "en" | "zh-HK") => { translationState.locale = locale; }),
}));
vi.mock("next/image", () => ({default: ({alt, src}: {alt: string; src: string}) => <img alt={alt} src={src} />}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, href}: {children: ReactNode; href: string}) => <a href={href}>{children}</a>}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository}));
vi.mock("@/lib/home/home-highlights", async (importOriginal) => ({...(await importOriginal<typeof import("@/lib/home/home-highlights")>()), loadHomeHighlights}));

const highlights: HomeHighlights = {event: {status: "empty"}, news: {status: "empty"}, showcase: {status: "empty"}};
const labels = {
  en: {title: "Our partners", intro: "Approved organisations supporting the WTIA community.", partner: "Approved partner"},
  "zh-HK": {title: "我們的合作夥伴", intro: "認識支持 WTIA 社群的核准機構。", partner: "核准夥伴"},
} as const;

async function renderHome(locale: "en" | "zh-HK", result: readonly PartnerProjection[] | null | Error) {
  translationState.locale = locale;
  translationState.messages = {en, "zh-HK": zh};
  loadHomeHighlights.mockResolvedValueOnce(highlights);
  if (result instanceof Error) partnersRepository.listPublished.mockRejectedValueOnce(result);
  else partnersRepository.listPublished.mockResolvedValueOnce(result);
  const {default: HomePage} = await import("@/app/[locale]/(public)/page");
  render(await HomePage({params: Promise.resolve({locale})}));
}

describe("HomePage partner-wall integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["en", "zh-HK"] as const)("uses dedicated partner-wall copy and renders a nonempty projection in %s", async (locale) => {
    const copy = labels[locale];
    const partner: PartnerProjection = {id: "11111111-1111-4111-8111-111111111111", name: copy.partner, category: "supporting", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false};
    await renderHome(locale, [partner]);

    expect(partnersRepository.listPublished).toHaveBeenCalledWith(locale, {limit: 12});
    expect(screen.getByRole("heading", {name: copy.title})).toBeVisible();
    expect(screen.getAllByRole("heading", {name: copy.title})).toHaveLength(1);
    expect(screen.getByText(copy.intro)).toBeVisible();
    expect(screen.getByText(copy.partner)).toBeVisible();
    expect(screen.getByText(locale === "zh-HK" ? zh.Home.highlights.event.empty : en.Home.highlights.event.empty)).toBeVisible();
    expect(loadHomeHighlights).toHaveBeenCalledExactlyOnceWith({locale});
  });

  it.each([null, [], new Error("database")])("hides a null, empty, or failed partner wall without coupling homepage highlights", async (result) => {
    await renderHome("en", result);

    expect(screen.queryByRole("heading", {name: labels.en.title})).not.toBeInTheDocument();
    expect(screen.getByText(en.Home.highlights.event.empty)).toBeVisible();
    expect(loadHomeHighlights).toHaveBeenCalledExactlyOnceWith({locale: "en"});
    expect(partnersRepository.listPublished).toHaveBeenCalledWith("en", {limit: 12});
  });
});
