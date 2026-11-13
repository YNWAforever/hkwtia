import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Preview voice pass approved by Willy (t419u, 2026-11-06 22:07 HKT) after Claire's
 * PASS on the 2026-11-06 Membership/Join string table. Only these leaves may move
 * for that voice pass. The fingerprint is every other leaf. It moved once after
 * 73ca3d2f when Navigation.links.media was added in both bundles,
 * MarketingExtras.footerTagline in zh-HK became「科技 + 智慧。香港 + 世界。」, and
 * programs.record.winnersOffSiteArchived was added in both bundles.
 */
const VOICE_ALLOWLIST = [
  "Membership.title",
  "Membership.summary",
  "Membership.tiersIntro",
  "Membership.closing.eyebrow",
  "Membership.closing.title",
  "Membership.closing.copy",
  "Membership.closing.join",
  "Membership.closing.contact",
  "Membership.faq.0.answer",
  "Membership.faq.1.question",
  "Membership.faq.1.answer",
  "Membership.metaDescription",
  "Join.choosePlanTitle",
  "Join.choosePlanDescription",
  "Join.choosePlanCompare",
  "Join.choosePlanContact",
  "Join.choosePlan.individual",
  "Join.choosePlan.corporate",
  "Join.choosePlan.platinum",
  "Join.choosePlan.community",
  "Join.metaDescription",
] as const;

const PROPOSED = {
  en: {
    "Membership.title": "Pick your WTIA membership",
    "Membership.summary": "Three paid tiers with clear annual fees. Compare plans below, then join online.",
    "Membership.tiersIntro": "Annual fees: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800.",
    "Membership.closing.eyebrow": "Next step",
    "Membership.closing.title": "Join online, or email us first.",
    "Membership.closing.copy": "Community is free. Individual, Corporate and Platinum pay online each year.",
    "Membership.closing.join": "Join WTIA",
    "Membership.closing.contact": "Email WTIA",
    "Membership.faq.0.answer": "Community is free for one person. Individual is HK$500 a year. Corporate (HK$1,800) and Platinum (HK$4,800) are for organisations and pay online.",
    "Membership.faq.1.question": "Where are the fees?",
    "Membership.faq.1.answer": "Fees are on the plan cards above: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800 a year. Confirm the amount at payment.",
    "Membership.metaDescription": "WTIA membership: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800 a year. Join online.",
    "Join.choosePlanTitle": "Choose a plan",
    "Join.choosePlanDescription": "Community is free. Paid tiers: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800 a year.",
    "Join.choosePlanCompare": "Compare fees",
    "Join.choosePlanContact": "Email WTIA",
    "Join.choosePlan.individual": "HK$500 a year. Pay online.",
    "Join.choosePlan.corporate": "HK$1,800 a year for an organisation. Pay online.",
    "Join.choosePlan.platinum": "HK$4,800 a year. Pay online.",
    "Join.choosePlan.community": "Free. Directory card and public event RSVP.",
    "Join.metaDescription": "Join WTIA online. Choose a tier, create an account and pay the annual fee.",
  },
  "zh-HK": {
    "Membership.title": "選擇你的 WTIA 會籍",
    "Membership.summary": "三個收費級別，年費清楚列明。先比較計劃，再於網上加入。",
    "Membership.tiersIntro": "年費：個人 HK$500、企業 HK$1,800、白金 HK$4,800。",
    "Membership.closing.eyebrow": "下一步",
    "Membership.closing.title": "先網上加入，或先電郵查詢。",
    "Membership.closing.copy": "社群會籍免費。個人、企業及白金會籍每年於網上付款。",
    "Membership.closing.join": "加入 WTIA",
    "Membership.closing.contact": "電郵 WTIA",
    "Membership.faq.0.answer": "社群會籍免費，適合一人。個人會籍每年 HK$500。企業（HK$1,800）及白金（HK$4,800）適合機構，並於網上付款。",
    "Membership.faq.1.question": "會費在哪裡？",
    "Membership.faq.1.answer": "會費見上方計劃卡：個人每年 HK$500、企業 HK$1,800、白金 HK$4,800。付款前以付款頁顯示金額為準。",
    "Membership.metaDescription": "會費：個人 HK$500、企業 HK$1,800、白金 HK$4,800。歡迎加入。",
    "Join.choosePlanTitle": "選擇計劃",
    "Join.choosePlanDescription": "社群免費。年費：個人 HK$500、企業 HK$1,800、白金 HK$4,800。",
    "Join.choosePlanCompare": "比較會費",
    "Join.choosePlanContact": "電郵 WTIA",
    "Join.choosePlan.individual": "每年 HK$500。網上付款。",
    "Join.choosePlan.corporate": "機構每年 HK$1,800。網上付款。",
    "Join.choosePlan.platinum": "每年 HK$4,800。網上付款。",
    "Join.choosePlan.community": "免費。會員名片及公開活動報名。",
    "Join.metaDescription": "網上加入 WTIA：選級別、建帳戶、繳年費。",
  },
} as const;

const UNCHANGED = {
  en: {
    "Membership.tiersTitle": "Membership tiers",
    "Membership.faq.0.question": "Who can apply?",
    "Membership.metaTitle": "Membership｜Hong Kong Wireless Technology Industry Association (WTIA)",
    "Membership.eyebrow": "Membership",
    "Membership.breadcrumbCurrent": "Membership",
    "Membership.compare.uses": "Member benefits",
    "Join.title": "Join WTIA",
    "Join.choosePlanAction": "Continue with {plan}",
    "Join.metaTitle": "Membership application｜Hong Kong Wireless Technology Industry Association (WTIA)",
    "Join.choosePlan.startup": "New joins use Individual.",
    "Join.choosePlan.patron": "New joins use Platinum.",
  },
  "zh-HK": {
    "Membership.tiersTitle": "會員級別",
    "Membership.faq.0.question": "誰可以申請？",
    "Membership.metaTitle": "會員計劃｜香港無線科技商會 WTIA",
    "Membership.eyebrow": "會員計劃",
    "Membership.breadcrumbCurrent": "會員計劃",
    "Membership.compare.uses": "會員權益",
    "Join.title": "加入 WTIA",
    "Join.choosePlanAction": "以{plan}繼續",
    "Join.metaTitle": "會籍申請｜香港無線科技商會 WTIA",
    "Join.choosePlan.startup": "新申請請選擇個人會籍。",
    "Join.choosePlan.patron": "新申請請選擇白金會籍。",
  },
} as const;

const TIER_BENEFITS = {
  en: {
    community: ["Directory card on /members", "RSVP to public WTIA events", "Event submissions are not included"],
    startup: ["Full member profile page with logo", "Submit up to 2 events per quarter for WTIA review", "1 showcase listing"],
    corporate: [
      "Free participation in networking events with industry experts and professionals",
      "Exclusive networking and business-matching events with C-suite / director-level professionals in wireless & mobile industries",
      "Marketing your in-house events on WTIA social networks",
      "Speaking opportunities in WTIA-organised events and career fairs at higher education institutions",
      "Free posting of job ads and career talks on WTIA website and social networks",
      "Priority invitations to flagship events (e.g. Hong Kong ICT Awards, Tech To Connect)",
    ],
    patron: ["Everything in Corporate"],
    individual: [
      "Free participation in networking events with industry experts and professionals",
      "Exclusive networking and business-matching events with C-suite or director-level professionals in the wireless and mobile industries",
      "WTIA event invitations and industry updates by email",
    ],
    platinum: [
      "Everything in Corporate",
      "Opportunities to join Sub-Committee or Advisory Board",
      "Eligible to vote at WTIA AGM / EGM (General Meetings)",
      "Your first representative is eligible for election to the Executive Committee",
      "Option of a Bespoke Partnership Contract (customised partnership & membership agreement)",
    ],
  },
  "zh-HK": {
    community: ["於 /members 顯示會員名片", "報名參加 WTIA 公開活動", "不包括提交活動"],
    startup: ["完整會員專頁（含商標）", "每季可提交最多 2 個活動供 WTIA 審核", "1 個方案展示頁"],
    corporate: [
      "免費參加與業界專家及專業人士的交流活動",
      "與無線及流動通訊業高級管理層／總監級人士的專屬交流及商業配對活動",
      "於 WTIA 社交平台宣傳公司活動",
      "WTIA 活動及大專院校職業博覽的演講機會",
      "免費於 WTIA 網站及社交平台刊登招聘廣告及職業講座",
      "旗艦活動優先邀請（例如香港資訊及通訊科技獎、Tech To Connect）",
    ],
    patron: ["包含企業會員所有權益"],
    individual: [
      "免費參加業界交流活動，與業界專家及專業人士建立聯繫",
      "專屬交流及商業配對活動，接觸無線及流動通訊業界的高級管理層／總監級專業人士",
      "透過電郵接收 WTIA 活動邀請及業界資訊",
    ],
    platinum: [
      "包括企業會員全部權益",
      "有機會加入小組委員會或顧問委員會",
      "可於 WTIA 週年大會（AGM）／特別大會（EGM）投票",
      "第一代表有權被選為執行委員會成員",
      "可選擇度身訂造的合作及會籍協議（Bespoke Partnership Contract）",
    ],
  },
} as const;

const NON_ALLOWLIST_FINGERPRINT = "cdf65ba1dfd56a9545f6bcca6361b7fb78ba08fe04507bd209b41e73273a904c";

type MessageTree = Record<string, unknown>;

function messageAt(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as MessageTree)[segment];
  }
  return current;
}

function omitAllowed(value: unknown, allow: ReadonlySet<string>, path = ""): unknown {
  if (Array.isArray(value)) return value.map((item, index) => omitAllowed(item, allow, `${path}.${index}`));
  if (value && typeof value === "object") {
    const out: MessageTree = {};
    for (const key of Object.keys(value as MessageTree).sort()) {
      const next = path ? `${path}.${key}` : key;
      if (allow.has(next)) continue;
      out[key] = omitAllowed((value as MessageTree)[key], allow, next);
    }
    return out;
  }
  return value;
}

function pathsOutsideAllowlist(before: unknown, after: unknown, allow: ReadonlySet<string>, path = ""): string[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    const left = Array.isArray(before) ? before : [];
    const right = Array.isArray(after) ? after : [];
    const found: string[] = [];
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      found.push(...pathsOutsideAllowlist(left[index], right[index], allow, `${path}.${index}`));
    }
    return found;
  }
  const leftObject = before !== null && typeof before === "object";
  const rightObject = after !== null && typeof after === "object";
  if (leftObject && rightObject) {
    const keys = new Set([...Object.keys(before as MessageTree), ...Object.keys(after as MessageTree)]);
    const found: string[] = [];
    for (const key of [...keys].sort()) {
      const next = path ? `${path}.${key}` : key;
      found.push(...pathsOutsideAllowlist((before as MessageTree)[key], (after as MessageTree)[key], allow, next));
    }
    return found;
  }
  return Object.is(before, after) ? [] : allow.has(path) ? [] : [path];
}

describe("Membership and Join voice strings", () => {
  const allow = new Set<string>(VOICE_ALLOWLIST);

  it("applies only the approved Proposed cells", () => {
    expect(VOICE_ALLOWLIST).toHaveLength(21);
    expect(new Set(VOICE_ALLOWLIST).size).toBe(VOICE_ALLOWLIST.length);
    for (const path of VOICE_ALLOWLIST) {
      expect(messageAt(en, path), `en ${path}`).toBe(PROPOSED.en[path]);
      expect(messageAt(zh, path), `zh-HK ${path}`).toBe(PROPOSED["zh-HK"][path]);
    }
  });

  it("leaves the named no-change cells and every tierBenefits line untouched", () => {
    for (const [path, value] of Object.entries(UNCHANGED.en)) {
      expect(allow.has(path), path).toBe(false);
      expect(messageAt(en, path)).toBe(value);
      expect(messageAt(zh, path)).toBe(UNCHANGED["zh-HK"][path as keyof typeof UNCHANGED["zh-HK"]]);
    }
    expect(en.Membership.tierBenefits).toEqual(TIER_BENEFITS.en);
    expect(zh.Membership.tierBenefits).toEqual(TIER_BENEFITS["zh-HK"]);
    expect(en.Membership.tierBenefits.corporate).toHaveLength(6);
    expect(en.Membership.tierBenefits.platinum).toHaveLength(5);
    expect(en.Membership.tierBenefits.individual).toHaveLength(3);
    expect(zh.Membership.tierBenefits.corporate).toHaveLength(6);
    expect(zh.Membership.tierBenefits.platinum).toHaveLength(5);
    expect(zh.Membership.tierBenefits.individual).toHaveLength(3);
  });

  it("keeps every other message value at the current non-allowlist fingerprint", () => {
    const payload = JSON.stringify({en: omitAllowed(en, allow), "zh-HK": omitAllowed(zh, allow)});
    expect(createHash("sha256").update(payload).digest("hex")).toBe(NON_ALLOWLIST_FINGERPRINT);
  });

  it("detects the shapes it is meant to catch", () => {
    const narrow = new Set(["Membership.title"]);
    const before = {
      Membership: {title: "old", tierBenefits: {corporate: ["kit"]}},
      Home: {title: "Home"},
    };
    expect(pathsOutsideAllowlist(before, {
      Membership: {title: "new", tierBenefits: {corporate: ["kit"]}},
      Home: {title: "Home"},
    }, narrow)).toEqual([]);
    expect(pathsOutsideAllowlist(before, {
      Membership: {title: "new", tierBenefits: {corporate: ["changed kit"]}},
      Home: {title: "Home"},
    }, narrow)).toEqual(["Membership.tierBenefits.corporate.0"]);
    expect(pathsOutsideAllowlist(before, {
      Membership: {title: "new", tierBenefits: {corporate: ["kit"]}},
      Home: {title: "About"},
    }, narrow)).toEqual(["Home.title"]);
    expect(pathsOutsideAllowlist(before, {
      Membership: {title: "new", tierBenefits: {corporate: ["kit"]}},
      Home: {title: "Home", extra: "x"},
    }, new Set<string>())).toEqual(["Home.extra", "Membership.title"]);
  });
});
