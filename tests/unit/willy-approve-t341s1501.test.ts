import {readFileSync} from "node:fs";

import type {Organization, WithContext} from "schema-dts";
import {describe, expect, it} from "vitest";

import {OPS_MEMBERSHIP_TIERS} from "@/config/membership-journey";
import {GET as llmsTxt} from "@/app/llms.txt/route";
import {LLMS_TXT} from "@/lib/seo/llms-txt";
import {buildOrganizationData} from "@/lib/structured-data";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const EN_META = {
  Home: "WTIA connects Hong Kong's wireless and AI+ community—members, events, programmes and GBA opportunities.",
  About: "About WTIA / Wireless（香港無線科技商會）— Hong Kong's not-for-profit wireless and emerging technology association since 2001.",
  History: "Twenty-five years of WTIA milestones—from 2001 founding through wireless, mobile and AI+ programmes.",
  Chairman: "A message from Willy Lai, Chairman of WTIA / Wireless（香港無線科技商會）.",
  Committees: "Committee details for the 2026–2028 term will be published shortly.",
  Membership: "Explore WTIA membership options for individuals and organisations. Join at hkwtia.org.",
  Contact: "Contact WTIA / Wireless（香港無線科技商會）. Email contact@hkwtia.org. Visit hkwtia.org.",
  Members: "WTIA member directory—published profiles of Hong Kong wireless and technology companies.",
  Showcase: "Browse published technology solutions from WTIA member companies.",
  News: "News and updates from the Hong Kong Wireless Technology Industry Association (WTIA).",
} as const;

const ZH_META = {
  Home: "香港無線科技商會（WTIA）連繫會員、活動、計劃及大灣區創科機遇。",
  About: "關於香港無線科技商會（WTIA／Wireless）：自2001年起服務香港無線及新興科技業界的非牟利商會。",
  History: "香港無線科技商會二十五年歷程：自2001年成立至今的無線、流動及創科里程碑。",
  Chairman: "香港無線科技商會（WTIA）主席賴志偉的話。",
  Committees: "2026–2028 年度委員會資料稍後公布。",
  Membership: "了解 WTIA 個人及機構會籍選項。歡迎於 hkwtia.org 查詢及申請。",
  Contact: "聯絡香港無線科技商會（WTIA）。電郵 contact@hkwtia.org。網址 hkwtia.org。",
  Members: "WTIA 會員名錄：已發布的香港無線及科技企業簡介。",
  Showcase: "瀏覽 WTIA 會員企業已發布的科技方案。",
  News: "香港無線科技商會（WTIA）最新消息及公告。",
} as const;

describe("Willy Approve t341s1501", () => {
  it("pins the Phase 0 descriptions and their length caps", () => {
    for (const [namespace, description] of Object.entries(EN_META)) {
      expect(en[namespace as keyof typeof EN_META].metaDescription).toBe(description);
      expect(description.length, namespace).toBeLessThanOrEqual(155);
    }
    for (const [namespace, description] of Object.entries(ZH_META)) {
      expect(zh[namespace as keyof typeof ZH_META].metaDescription).toBe(description);
      expect([...description].length, namespace).toBeLessThanOrEqual(80);
    }
  });

  it("keeps WiseTech, HKWTA, WISE and 會長 out of the approved public copy", () => {
    const surfaces = [
      en.Home.metaTitle, en.Home.metaDescription, zh.Home.metaTitle, zh.Home.metaDescription,
      en.About.summary, en.About.foundedBody, zh.About.summary, zh.About.foundedBody,
      en.Chairman.message, en.Chairman.signature, zh.Chairman.message, zh.Chairman.signature,
      en.Contact.description, zh.Contact.description,
      en.Navigation.logoAlt, zh.Footer.brand.logoAlt,
      en.Members.noPublishedTitle, zh.Members.noPublishedDescription,
      en.Showcase.noPublishedDescription, zh.News.emptyDescription,
    ].join("\n");
    expect(surfaces).not.toMatch(/WiseTech/);
    expect(surfaces).not.toMatch(/\bHKWTA\b/);
    expect(surfaces).not.toMatch(/\bWISE\b/);
    expect(surfaces).not.toMatch(/會長/);
    expect(surfaces).not.toMatch(/香港智慧科技商會/);
    expect(zh.About.summary + zh.About.foundedBody + zh.About.historyIntro + zh.Chairman.message).not.toMatch(/[係嘅唔冇]/);
  });

  it("serves the factual llms.txt draft as text/plain", async () => {
    const response = llmsTxt();
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe(LLMS_TXT);
    expect(LLMS_TXT).toContain("Primary site: https://hkwtia.org");
    expect(LLMS_TXT).toContain("Do not use: WiseTech Hong Kong; HKWTA; WISE subtitle");
    expect(LLMS_TXT).not.toMatch(/\+852|Hung To|KOHO|HK\$\d/);
  });

  it("names the organization without WiseTech and keeps the existing contact fields", () => {
    const data = buildOrganizationData() as WithContext<Exclude<Organization, string>>;
    expect(data.alternateName).toEqual(["WTIA", "香港無線科技商會", "HKWTIA"]);
    expect(data.email).toBe("contact@hkwtia.org");
    expect(data.telephone).toBeUndefined();
    expect(data.address).toBeUndefined();
  });

  it("shows the approved public fees and no startup HK$1,200 tier", () => {
    expect(OPS_MEMBERSHIP_TIERS.map((tier) => [tier.code, tier.annualPriceHkd])).toEqual([
      ["individual", 500],
      ["corporate", 1800],
      ["platinum", 4800],
    ]);
    const publicCopy = [
      en.Membership.metaDescription,
      zh.Membership.metaDescription,
      JSON.stringify(en.Home.conversionPaths),
      JSON.stringify(zh.Home.conversionPaths),
      en.Membership.tracks.individual.copy,
      en.Membership.tracks.organisation.copy,
    ].join("\n");
    expect(publicCopy).not.toMatch(/1,200|HK\$1200|初創/);
    expect(en.Membership.tracks.individual.copy).toContain("HK$500");
    expect(en.Membership.tracks.organisation.copy).toContain("HK$1,800");
    expect(en.Membership.tracks.organisation.copy).toContain("HK$4,800");
    expect(en.Membership.actions.payOnline).toBe("Pay online now");
    expect(en.Join.choosePlan.platinum).toBe("HK$4,800 a year. Pay online now.");
    expect(zh.Join.choosePlan.platinum).toBe("每年 HK$4,800。現在網上付款。");
    expect(publicCopy).toMatch(/HK\$500/);
    expect(publicCopy).not.toMatch(/5 working days|25 seats|二十五席/);
  });

  it("does not put a handwritten lastmod date in the sitemap source", () => {
    const source = readFileSync("app/sitemap.ts", "utf8");
    expect(source).toContain("staticRouteLastmod");
    expect(source).toContain("publishedAt");
    expect(source).not.toMatch(/lastModified:\s*["']\d{4}-\d{2}-\d{2}/);
  });
});
