import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {cleanup, render, screen} from "@testing-library/react";
import {NextIntlClientProvider} from "next-intl";
import type {ImgHTMLAttributes, ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {cpai} from "@/content/programs/cpai";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Production /programs/cpai stated an unverified issuer and audience, and an
 * automatic CUSCS completion certificate. Claire's 19 Nov 2026 checklist and
 * Alice's draft (not a publishing approval) allow only the conditional
 * certificate sentences below. Issuer, audience, the partner promotional
 * paragraph, and the withdrawn "taught by CUSCS" / WTIA-issued qualification
 * wording stay off the page.
 */
const completion = {
  en: {
    heading: "Certificate of Completion",
    body: "Participants with an attendance rate of at least 70% who pass the assignment can apply for a Certificate of Completion.",
  },
  "zh-HK": {
    heading: "結業證書",
    body: "出席率達至少 70%，並且功課合格的學員，可申請結業證書。",
  },
} as const;

const withheld = [
  "Issued by",
  "頒發機構",
  "頒發",
  "Graduates also receive",
  "畢業學員另可獲頒",
  "Professionals completing WTIA's applied AI credential",
  "修讀 WTIA 應用人工智能專業資格的在職人士",
  "應用人工智能專業資格",
  "專業資格",
  "CUSCS Certificate of Completion",
  "CUSCS 結業證書",
  "Course delivered with",
  "課程合辦機構",
  "taught by CUSCS",
  "CUSCS 教授",
  "jointly offered",
  "Qualified instructors are arranged by WTIA",
  "合資格導師由 WTIA 安排",
  "headed WTIA",
  "以 WTIA 為抬頭",
  "Who it's for",
  "適合對象",
  "Credential",
  "automatically",
  "自動獲",
  "Explore the Generative AI for Business Innovation and Applications course and the requirements for a Certificate of Completion.",
  "了解「生成式AI商業創新與應用」課程，以及申請結業證書的條件。",
  "Generative AI for Business Innovation and Applications is jointly offered by CUSCS and WTIA.",
  "「生成式AI商業創新與應用」課程由 CUSCS 與 WTIA 合辦，合資格導師由 WTIA 安排。",
] as const;

const guidanceFiles = [
  "content/programs/cpai.ts",
  "content/schemas.ts",
  "components/marketing/program-credential.tsx",
  "app/[locale]/(public)/programs/cpai/page.tsx",
] as const;

type Locale = "en" | "zh-HK";

const {translationState} = vi.hoisted(() => {
  const state = {locale: "en" as Locale, messages: {} as Record<string, Record<string, unknown>>};
  return {translationState: state};
});

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (input: string | {locale?: string; namespace?: string}) => {
    const namespace = typeof input === "string" ? input : input.namespace;
    const locale = typeof input === "string" ? translationState.locale : (input.locale ?? translationState.locale);
    return (key: string, values?: Record<string, string | number>) => {
      let value: unknown = translationState.messages[locale];
      for (const part of [...(namespace?.split(".") ?? []), ...key.split(".")]) {
        value = (value as Record<string, unknown> | undefined)?.[part];
      }
      if (typeof value !== "string") throw new Error(`Missing test message: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce(
        (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
        value,
      );
    };
  }),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

function renderWithIntl(locale: Locale, element: ReactElement) {
  render(<NextIntlClientProvider locale={locale}>{element}</NextIntlClientProvider>);
}

describe("CPAI unsupported claims", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    translationState.locale = "en";
    translationState.messages = {en, "zh-HK": zh};
  });

  it.each(["en", "zh-HK"] as const)("renders %s without an issuer, audience, or automatic certificate", async (locale) => {
    translationState.locale = locale;
    const {default: CpaiPage} = await import("@/app/[locale]/(public)/programs/cpai/page");
    renderWithIntl(locale, await CpaiPage({params: Promise.resolve({locale})}));

    const copy = completion[locale];
    const text = document.body.textContent ?? "";
    expect(text).toContain(copy.heading);
    expect(text).toContain(copy.body);
    expect(screen.getByText(copy.heading)).toBeVisible();
    expect(screen.getByText(copy.body)).toBeVisible();
    for (const claim of withheld) expect(text, claim).not.toContain(claim);

    const compass = document.querySelector(".cpai-compass .rich-compass-grid");
    expect(compass?.children).toHaveLength(2);
    for (const cell of Array.from(compass?.children ?? [])) {
      expect(cell.querySelector("strong")?.textContent?.trim()).toBeTruthy();
      expect(cell.querySelector("span")?.textContent?.trim()).toBeTruthy();
    }
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelectorAll("h1, h2, h3").length).toBeGreaterThan(0);
    for (const heading of Array.from(document.querySelectorAll("h1, h2, h3"))) {
      expect(heading.textContent?.trim()).toBeTruthy();
    }
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const json = script.textContent ?? "";
      for (const claim of withheld) expect(json, claim).not.toContain(claim);
    }
  });

  it("keeps the short CPAI title and does not swap in an unapproved lead", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/programs/cpai/page");
    for (const locale of ["en", "zh-HK"] as const) {
      translationState.locale = locale;
      const metadata = await generateMetadata({params: Promise.resolve({locale})});
      expect(metadata).toMatchObject({
        description: locale === "en" ? en.programs.cpai.description : zh.programs.cpai.description,
      });
      const description = String(metadata.description);
      for (const claim of withheld) expect(description, claim).not.toContain(claim);
    }
  });

  it("stores the conditional certificate and no issuer on the CPAI record", () => {
    expect(cpai).not.toHaveProperty("issuerEn");
    expect(cpai).not.toHaveProperty("issuerZh");
    expect(cpai.partnerCertificateEn).toBe(completion.en.body);
    expect(cpai.partnerCertificateZh).toBe(completion["zh-HK"].body);
    expect(cpai.images).toEqual([]);
    expect(en.programs.record.credentialPartnerCertificate).toBe(completion.en.heading);
    expect(zh.programs.record.credentialPartnerCertificate).toBe(completion["zh-HK"].heading);
    expect(en.programs.cpai).not.toHaveProperty("audience");
    expect(zh.programs.cpai).not.toHaveProperty("audience");
    expect(en.programs.record).not.toHaveProperty("credentialIssuer");
    expect(zh.programs.record).not.toHaveProperty("credentialIssuer");
    expect(en.programs.record).not.toHaveProperty("credentialCoursePartner");
    expect(zh.programs.record).not.toHaveProperty("credentialCoursePartner");
  });

  it("keeps the certificate template out of public/", () => {
    const root = process.cwd();
    expect(existsSync(resolve(root, "public/images/programs/CPAI-Certificate-F.jpg"))).toBe(false);
    expect(existsSync(resolve(root, "content/cpai-certificate-withheld/CPAI-Certificate-F.jpg"))).toBe(true);
    expect(cpai.images).toEqual([]);
  });

  it("does not leave withdrawn issuer or teaching sentences as implementation guidance", () => {
    for (const file of guidanceFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8").replace(/\s+/g, " ");
      expect(source, file).not.toContain("WTIA issues CPAI alone");
      expect(source, file).not.toContain("CUSCS teaches the course");
    }
  });

  it("detects the guidance sentences it is meant to catch", () => {
    expect(guidanceFiles.length).toBeGreaterThanOrEqual(4);
    const hostile = "WTIA issues CPAI alone. CUSCS teaches the course. Graduates also receive a CUSCS Certificate of Completion.";
    expect(hostile).toContain("WTIA issues CPAI alone");
    expect(hostile).toContain("CUSCS teaches the course");
    expect(withheld.some((claim) => hostile.includes(claim))).toBe(true);
  });
});
