import {readFileSync} from "node:fs";

import type {Organization, Person, WithContext} from "schema-dts";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {buildPageMetadata} from "@/lib/metadata";
import {holdItems, seoGeoApproval, unchangedControls} from "@/lib/seo/geo-disposition";
import {buildChairmanData, buildOrganizationData} from "@/lib/structured-data";

/**
 * Willy t578s2629, 2026-11-19 05:07 Asia/Hong_Kong: verified core answers only.
 * HOLD facts stay absent from these keys. The strings are the bilingual draft's
 * candidate copy, with markdown backticks removed so the page can show the path.
 */
const VERIFIED = {
  en: {
    "Home.identityQuestion": "What is WTIA?",
    "Home.identity": "WTIA is the Hong Kong Wireless Technology Industry Association.",
    "About.identityQuestion": "What do the names WTIA and WIRELESS refer to here?",
    "About.identity": "WTIA / WIRELESS refers here to the Hong Kong Wireless Technology Industry Association, 香港無線科技商會.",
    "History.announcementQuestion": "Are the historical summaries original announcements?",
    "History.announcementNote": "The History page (/about/history) presents summaries of past programmes and activities. These summaries are distinct from the original WTIA news announcements; use the original announcement when you need its exact wording and publication context.",
    "Chairman.termQuestion": "Who is WTIA’s Chairman?",
    "Chairman.term": "Willy Lai (賴志偉) has served as WTIA Chairman since 7 October 2026. His term is 2026–2028.",
    "Membership.faq.1.question": "What are the annual membership fees for 2026–27?",
    "Membership.faq.1.answer": "The 2026–27 annual fees are HK$500 for Individual membership, HK$1,800 for Corporate membership and HK$4,800 for Platinum membership.",
    "Membership.tiersIntro": "The 2026–27 annual fees are HK$500 for Individual membership, HK$1,800 for Corporate membership and HK$4,800 for Platinum membership.",
    "programs.cpai.listedTopicsQuestion": "What topics does the published CPAI page list?",
    "programs.cpai.listedTopics": "The CPAI page (/programs/cpai) lists strategic frameworks for enterprise AI adoption, hands-on generative AI content creation, cybersecurity and compliance essentials, and AI case studies across industries. Confirm the applicable intake’s syllabus before enrolling.",
    "Events.checkQuestion": "Where should I check event information?",
    "Events.checkAnswer": "Use the Events page as a starting point. Confirm an event’s date, location or format, language, eligibility, fee and registration status before making arrangements.",
  },
  "zh-HK": {
    "Home.identityQuestion": "WTIA是甚麼？",
    "Home.identity": "WTIA是香港無線科技商會。",
    "About.identityQuestion": "這裡的WTIA／WIRELESS指哪個機構？",
    "About.identity": "這裡的WTIA／WIRELESS指香港無線科技商會（Hong Kong Wireless Technology Industry Association）。",
    "History.announcementQuestion": "歷史摘要是否等同原公告？",
    "History.announcementNote": "「歷史」頁（/about/history）載有過往項目及活動的摘要，與WTIA原新聞公告不同。如需引用準確原文及發布背景，應查閱原公告。",
    "Chairman.termQuestion": "WTIA主席是誰？",
    "Chairman.term": "賴志偉（Willy Lai）自2026年10月7日起出任WTIA主席，任期為2026–2028年。",
    "Membership.faq.1.question": "2026–27年度會籍年費是多少？",
    "Membership.faq.1.answer": "2026–27年度年費為：個人會籍HK$500、企業會籍HK$1,800、白金會籍HK$4,800。",
    "Membership.tiersIntro": "2026–27年度年費為：個人會籍HK$500、企業會籍HK$1,800、白金會籍HK$4,800。",
    "programs.cpai.listedTopicsQuestion": "CPAI公開頁列有哪些主題？",
    "programs.cpai.listedTopics": "CPAI頁（/programs/cpai）列出的課綱主題包括企業採用AI的策略框架、生成式AI內容創作實作、網絡安全與合規要點，以及跨行業AI案例。報讀前請確認適用期數的課綱。",
    "Events.checkQuestion": "在哪裡查閱活動資訊？",
    "Events.checkAnswer": "可先到「活動」頁查看。安排行程前，請確認個別活動的日期、地點或形式、語言、參加資格、費用及報名狀態。",
  },
} as const;

const HOLD_LEAKS = [
  "[待確認",
  "Founding year 2001",
  "成立日期",
  "WiseTech",
  "會長",
] as const;

type MessageTree = Record<string, unknown>;

function messageAt(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as MessageTree)[segment];
  }
  return current;
}

const publicPosts = vi.hoisted(() => ({
  listPublishedBuildLogs: vi.fn(),
  listPublishedNews: vi.fn(),
}));
const showcase = vi.hoisted(() => ({listPublishedSlugs: vi.fn()}));
const events = vi.hoisted(() => ({listPublicSlugs: vi.fn()}));
const companyProfiles = vi.hoisted(() => ({listPublishedSlugs: vi.fn()}));

vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: companyProfiles}));

import sitemap from "@/app/sitemap";

describe("verified bilingual core answers (t578s2629)", () => {
  it("publishes the approved English and Chinese sentences on the named keys", () => {
    expect(Object.keys(VERIFIED.en)).toEqual(Object.keys(VERIFIED["zh-HK"]));
    for (const path of Object.keys(VERIFIED.en) as (keyof typeof VERIFIED.en)[]) {
      expect(messageAt(en, path), `en ${path}`).toBe(VERIFIED.en[path]);
      expect(messageAt(zh, path), `zh-HK ${path}`).toBe(VERIFIED["zh-HK"][path]);
    }
  });

  it("keeps HOLD wording out of those answers and keeps the three public fees", () => {
    const published = Object.keys(VERIFIED.en).map((path) => `${messageAt(en, path)}\n${messageAt(zh, path)}`).join("\n");
    for (const leak of HOLD_LEAKS) expect(published).not.toContain(leak);
    // WIRELESS is the approved public brand. A bare WISE token is not.
    expect(published).not.toMatch(/(^|[^A-Z])WISE([^A-Z]|$)/);
    expect(published).toContain("HK$500");
    expect(published).toContain("HK$1,800");
    expect(published).toContain("HK$4,800");
    expect(published).not.toMatch(/HK\$1,200|HK\$0[^.]/);
    expect(en.Chairman.term).toContain("Chairman");
    expect(zh.Chairman.term).toContain("主席");
  });

  it("names the approval and leaves the undecided facts on HOLD", () => {
    expect(seoGeoApproval.id).toBe("t578s2629");
    expect(seoGeoApproval.startingSha).toBe("da716b572fd9be6d0f6a4ff3e936edd3a47f2049");
    expect(holdItems.map(({id}) => id)).toEqual([
      "D1-formal-origin",
      "D1-news-ledger",
      "D1-history-redirect",
      "D2-founding-date",
      "D2-eligibility-seats",
      "D2-activation",
      "D2-renewal-refund",
      "D2-cpai-qualification",
      "D2-cpai-intake",
      "D2-open-events",
      "D3-measurement",
      "T08-field-data",
    ]);
    expect(unchangedControls).toEqual(expect.arrayContaining([
      "robots",
      "canonical-host",
      "index-submission",
      "protection",
    ]));
  });
});

describe("T04 canonical alternates for the core pages", () => {
  const paths = ["/", "/about", "/about/history", "/about/chairman", "/membership", "/programs/cpai", "/events"] as const;

  it("uses a same-language self canonical and a reciprocal en / zh-HK / x-default set", () => {
    for (const pathname of paths) {
      const english = buildPageMetadata({locale: "en", pathname, title: "t", description: "d"});
      const chinese = buildPageMetadata({locale: "zh-HK", pathname, title: "t", description: "d"});
      const enUrl = String(english.alternates?.canonical);
      const zhUrl = String(chinese.alternates?.canonical);
      expect(enUrl).toBe(english.alternates?.languages?.en);
      expect(zhUrl).toBe(chinese.alternates?.languages?.["zh-HK"]);
      expect(english.alternates?.languages).toEqual(chinese.alternates?.languages);
      expect(english.alternates?.languages?.["x-default"]).toBe(enUrl);
      expect(zhUrl).not.toBe(enUrl);
    }
  });
});

describe("T05 sitemap lastmod provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedNews.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue(["harbour-vision-ai"]);
    events.listPublicSlugs.mockResolvedValue(["briefing"]);
    companyProfiles.listPublishedSlugs.mockResolvedValue(["harbour-vision-ai"]);
  });

  it("omits lastmod on database urls that have no row timestamp", async () => {
    const entries = await sitemap();
    for (const url of [
      "http://localhost:3000/events/briefing",
      "http://localhost:3000/zh/events/briefing",
      "http://localhost:3000/showcase/harbour-vision-ai",
      "http://localhost:3000/members/harbour-vision-ai",
    ]) {
      expect(entries.find((entry) => entry.url === url)?.lastModified, url).toBeUndefined();
    }
    const home = entries.find((entry) => entry.url === "http://localhost:3000/")!;
    expect(home.lastModified).toBeInstanceOf(Date);
    const source = readFileSync("app/sitemap.ts", "utf8");
    expect(source).not.toMatch(/buildLastmod\(/);
  });
});

describe("T06 chairman entity without invented organisation facts", () => {
  it("matches the visible chairman sentence and does not add a founding date or a member count", () => {
    // schema-dts unions Person with a plain string id reference.
    const person = buildChairmanData() as WithContext<Exclude<Person, string>>;
    expect(person["@type"]).toBe("Person");
    expect(person.name).toBe("Willy Lai");
    expect(person.alternateName).toBe("賴志偉");
    expect(person.jobTitle).toBe("Chairman");
    expect(person.description).toBe(en.Chairman.term);
    expect(JSON.stringify(person)).toContain("7 October 2026");
    expect(JSON.stringify(person)).not.toContain("2028-12-31");
    expect(person).not.toHaveProperty("foundingDate");

    const organization = buildOrganizationData() as WithContext<Exclude<Organization, string>>;
    expect(organization["@type"]).toBe("Organization");
    expect(organization).not.toHaveProperty("foundingDate");
    expect(organization).not.toHaveProperty("numberOfEmployees");
    expect(JSON.stringify(organization)).not.toMatch(/WiseTech|WISE/);
  });
});

describe("robots and index policy stay put", () => {
  it("does not add a bot rule, an IndexNow hook, or a noindex flip in this change", () => {
    const robots = readFileSync("app/robots.ts", "utf8");
    expect(robots).toContain("userAgent: '*'");
    expect(robots).toContain("userAgent: 'GPTBot'");
    expect(robots).toContain("userAgent: 'ClaudeBot'");
    expect(robots).toContain("userAgent: 'PerplexityBot'");
    expect(robots).not.toMatch(/IndexNow|Googlebot|OAI-SearchBot|Claude-SearchBot/);
    const history = readFileSync("next.config.ts", "utf8");
    expect(history).toContain('{source: "/history", destination: "/about", permanent: true}');
  });
});
