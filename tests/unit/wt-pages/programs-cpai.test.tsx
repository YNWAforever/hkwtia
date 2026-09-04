import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {cpai} from "@/content/programs/cpai";

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
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      // `namespace` itself may be dotted (e.g. "programs.cpai"), so it is traversed
      // segment-by-segment against the parsed JSON bundle exactly like `key` below, rather than
      // looked up as one flat key -- see tests/unit/wt-pages/programs-editions.test.tsx.
      let value: unknown = translationState.messages[locale];
      for (const part of [...namespace.split("."), ...key.split(".")]) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value);
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

describe("/programs/cpai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the credential header (no edition count) and keeps ProgramCredential below", async () => {
    const {default: CpaiPage} = await import("@/app/[locale]/(public)/programs/cpai/page");
    renderWithIntl("en", await CpaiPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: en.programs.cpai.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(en.programs.record.credentialFact);
    expect(compass?.textContent).not.toMatch(/\d+ editions?/);
    expect(compass?.textContent).toContain(en.programs.cpai.audience);
    const mailLink = screen.getByRole("link", {name: en.programs.record.askProgrammeTeam});
    expect(mailLink.getAttribute("href")).toMatch(/^mailto:contact@hkwtia\.org\?subject=/);

    expect(screen.getByRole("heading", {level: 2, name: cpai.courseNameEn})).toBeVisible();
    expect(screen.getByRole("heading", {level: 3, name: en.programs.record.credentialSyllabus})).toBeVisible();
  });

  it("never imports ProgramEditions -- there is no edition data for a credential", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/programs/cpai/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("ProgramCredential");
    expect(source).not.toContain("ProgramEditions");
    expect(source).not.toContain("ProgramDetail");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
