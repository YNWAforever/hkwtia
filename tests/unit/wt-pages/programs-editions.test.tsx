import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {asa} from "@/content/programs/asa";
import {summarizeProgrammes} from "@/lib/home/programme-summaries";

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

// `editionsFact` is a real ICU plural message ("{count, plural, one {# edition} other {#
// editions}} since {year}"), not a flat placeholder -- next-intl resolves the plural branch and
// substitutes `#` with the count itself in production. This fake translator does the same, in
// the one minimal shape this suite's messages actually use, before falling back to plain
// `{name}` substitution for everything else.
function formatIcuMessage(template: string, values: Record<string, string | number> = {}): string {
  const withPluralsResolved = template.replace(/\{(\w+),\s*plural,\s*([\s\S]*?\})\}/g, (_match, name: string, clauses: string) => {
    const count = Number(values[name] ?? 0);
    const branch = count === 1 ? "one" : "other";
    const branchMatch = new RegExp(`${branch}\\s*\\{([^{}]*)\\}`).exec(clauses);
    return (branchMatch?.[1] ?? "").replace(/#/g, String(count));
  });
  return Object.entries(values).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), withPluralsResolved);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      // `namespace` itself may be dotted (e.g. "programs.asa" for the programme routes' own
      // namespace), so it is traversed segment-by-segment against the parsed JSON bundle exactly
      // like `key` below, rather than looked up as one flat key.
      let value: unknown = translationState.messages[locale];
      for (const part of [...namespace.split("."), ...key.split(".")]) value = (value as Record<string, unknown> | undefined)?.[part];
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return formatIcuMessage(value, values);
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

describe("/programs/asa (representative of asa/hkict/tct)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it("renders the ProgrammeRecordPage header (type eyebrow, key fact, audience, mailto action) and keeps ProgramEditions below", async () => {
    const {default: AsaPage} = await import("@/app/[locale]/(public)/programs/asa/page");
    renderWithIntl("en", await AsaPage({params: Promise.resolve({locale: "en"})}));

    const summary = summarizeProgrammes().find((programme) => programme.id === "asa")!;
    expect(screen.getByRole("heading", {level: 1, name: en.programs.asa.title})).toBeVisible();
    const compass = document.querySelector(".rich-compass-grid");
    expect(compass?.textContent).toContain(String(summary.editionCount));
    expect(compass?.textContent).toContain(String(summary.latestYear));
    expect(compass?.textContent).toContain(en.programs.asa.audience);
    const mailLink = screen.getByRole("link", {name: en.programs.record.askProgrammeTeam});
    expect(mailLink.getAttribute("href")).toMatch(/^mailto:contact@hkwtia\.org\?subject=/);

    expect(screen.getByText(en.programs.record.statusHeading)).toBeVisible();
    expect(screen.getByText(en.programs.asa.status)).toBeVisible();

    expect(screen.getByRole("heading", {level: 2, name: en.programs.record.editionsHeading})).toBeVisible();
    expect(screen.getAllByRole("heading", {level: 3}).map(({textContent}) => textContent)).toEqual(
      asa.editions.map((edition) => edition.labelEn),
    );
  });

  it("stays server-only, without the retired ProgramDetail wrapper", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/programs/asa/page.tsx"), "utf8");
    expect(source).toContain("PageHero");
    expect(source).toContain("RichCompass");
    expect(source).toContain("ProgramEditions");
    expect(source).not.toContain("ProgramDetail");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/<main\b/);
  });
});
