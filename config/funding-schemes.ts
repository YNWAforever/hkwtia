export const FUNDING_AS_OF = "2026-07-27" as const;

export type FundingLocale = "en" | "zh-HK";
type BilingualText = Readonly<Record<FundingLocale, string>>;

export type FundingEligibilityInput = Readonly<{
  hongKongIncorporated: boolean;
  hongKongBusinessRegistered: boolean;
  operatesInHongKong: boolean;
  nonSubvented: boolean;
  expansionProjectInCoveredEconomy: boolean;
  advancedTechnologyTraining: boolean;
  traineeHongKongPermanentResident: boolean;
  smartProductionLineInHongKong: boolean;
  targetSector:
    | "life-health"
    | "ai-data-science"
    | "advanced-manufacturing-new-energy"
    | "other";
  enterpriseInvestmentHkd: number;
  totalProjectCostHkd: number;
  eligibleAppliedRdOrPartnershipExpenditureHkd: number;
}>;

type FundingSchemeId =
  | "bud"
  | "nittp"
  | "nifs"
  | "nias"
  | "rd-cash-rebate";

export type FundingScheme = Readonly<{
  id: FundingSchemeId;
  active: true;
  asOf: typeof FUNDING_AS_OF;
  name: BilingualText;
  summary: BilingualText;
  sourceUrls: BilingualText;
}>;

function deepFreeze<const T extends object>(value: T): Readonly<T> {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") deepFreeze(nested);
  }
  return Object.freeze(value);
}

export const FUNDING_VERIFY_CURRENT_TERMS = deepFreeze({
  en: "This screening is informational, is not approval, and does not replace verification of current official terms.",
  "zh-HK": "此篩選結果只供參考，不代表獲批，亦不能取代查核最新官方條款。",
});

export const FUNDING_SCHEMES: readonly FundingScheme[] = Object.freeze([
  deepFreeze({
    id: "bud",
    active: true,
    asOf: FUNDING_AS_OF,
    name: {
      en: "Dedicated Fund on Branding, Upgrading and Domestic Sales (BUD Fund)",
      "zh-HK": "發展品牌、升級轉型及拓展內銷市場的專項基金（BUD專項基金）",
    },
    summary: {
      en: "From 15 June 2026, BUD covers 48 economies and the Easy BUD per-application ceiling is HK$150,000. The cumulative BUD ceiling is HK$7 million and the E-commerce Easy sublimit is HK$1 million. From 1 July 2026, EMF was consolidated into BUD.",
      "zh-HK": "由2026年6月15日起，BUD專項基金涵蓋48個經濟體，而申請易每宗申請上限為15萬港元。BUD專項基金累計資助上限為700萬港元，而電商易分項上限為100萬港元。由2026年7月1日起，中小企業市場推廣基金已併入BUD專項基金。",
    },
    sourceUrls: {
      en: "https://www.smefund.tid.gov.hk/english/bud/bud_home.html",
      "zh-HK": "https://www.smefund.tid.gov.hk/cindex.html",
    },
  }),
  deepFreeze({
    id: "nittp",
    active: true,
    asOf: FUNDING_AS_OF,
    name: {
      en: "New Industrialisation and Technology Training Programme",
      "zh-HK": "新型工業化及科技培訓計劃",
    },
    summary: {
      en: "Supports non-government, non-subvented Hong Kong-registered businesses training staff in advanced technologies on a 1:1 matching basis, up to HK$250,000 per company per financial year. Each trainee may take one course per financial year and must be a Hong Kong permanent resident.",
      "zh-HK": "以一比一配對形式支援本地公司培訓員工掌握先進科技，每家公司每個財政年度上限為25萬港元。每名學員每個財政年度可修讀一個課程，並須為香港永久性居民。",
    },
    sourceUrls: {
      en: "https://www.itf.gov.hk/en/funding-programmes/promoting-new-industrialisation/new-industrialisation-support-scheme/nittp/index.html",
      "zh-HK": "https://www.itf.gov.hk/tc/funding-programmes/promoting-new-industrialisation/new-industrialisation-support-scheme/nittp/index.html",
    },
  }),
  deepFreeze({
    id: "nifs",
    active: true,
    asOf: FUNDING_AS_OF,
    name: {
      en: "New Industrialisation Funding Scheme",
      "zh-HK": "新型工業化資助計劃",
    },
    summary: {
      en: "Supports Hong Kong-incorporated companies setting up smart production lines in Hong Kong. Government-to-company funding is 1:2, capped at one-third of approved cost or HK$15 million per project, with up to three concurrent projects and HK$45 million total.",
      "zh-HK": "支援香港註冊公司在香港設立智能生產線。政府與公司資助比例為一比二，每個項目上限為核准成本三分之一或1,500萬港元；可同時進行最多三個項目，總上限為4,500萬港元。",
    },
    sourceUrls: {
      en: "https://www.itf.gov.hk/en/funding-programmes/facilitating-technology/nifs/",
      "zh-HK": "https://www.itf.gov.hk/tc/funding-programmes/facilitating-technology/nifs/",
    },
  }),
  deepFreeze({
    id: "nias",
    active: true,
    asOf: FUNDING_AS_OF,
    name: {
      en: "New Industrialisation Acceleration Scheme",
      "zh-HK": "新型工業加速計劃",
    },
    summary: {
      en: "Supports Hong Kong-incorporated, non-subvented enterprises in life and health technology, AI and data science, or advanced manufacturing and new energy, where enterprise investment is at least HK$100 million and total project cost is at least HK$150 million.",
      "zh-HK": "支援從事生命健康科技、人工智能與數據科學，或先進製造與新能源的香港註冊非受資助企業；企業投資須不少於1億港元，項目總成本須不少於1.5億港元。",
    },
    sourceUrls: {
      en: "https://www.itf.gov.hk/en/funding-programmes/promoting-new-industrialisation/nias/index.html",
      "zh-HK": "https://www.itf.gov.hk/tc/funding-programmes/promoting-new-industrialisation/nias/index.html",
    },
  }),
  deepFreeze({
    id: "rd-cash-rebate",
    active: true,
    asOf: FUNDING_AS_OF,
    name: {
      en: "Research and Development Cash Rebate Scheme (CRS)",
      "zh-HK": "投資研發現金回贈計劃",
    },
    summary: {
      en: "Provides a 40% cash rebate for eligible applied research and development or partnership expenditure under the current scheme rules.",
      "zh-HK": "按現行計劃規則，為合資格的應用研發或合作研發開支提供40%現金回贈。",
    },
    sourceUrls: {
      en: "https://www.itf.gov.hk/filemanager/en/content_31/CRS_Guide_e_202507.pdf",
      "zh-HK": "https://www.itf.gov.hk/filemanager/tc/content_31/CRS_Guide_tc_202507.pdf",
    },
  }),
]);

function validMoney(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function eligibility(
  id: FundingSchemeId,
  input: FundingEligibilityInput,
): boolean {
  switch (id) {
    case "bud":
      return input.hongKongBusinessRegistered &&
        input.operatesInHongKong &&
        input.expansionProjectInCoveredEconomy;
    case "nittp":
      return input.hongKongBusinessRegistered &&
        input.nonSubvented &&
        input.advancedTechnologyTraining &&
        input.traineeHongKongPermanentResident;
    case "nifs":
      return input.hongKongIncorporated &&
        input.smartProductionLineInHongKong;
    case "nias":
      return input.hongKongIncorporated &&
        input.nonSubvented &&
        input.targetSector !== "other" &&
        validMoney(input.enterpriseInvestmentHkd) &&
        input.enterpriseInvestmentHkd >= 100_000_000 &&
        validMoney(input.totalProjectCostHkd) &&
        input.totalProjectCostHkd >= 150_000_000;
    case "rd-cash-rebate":
      return (
        input.hongKongIncorporated || input.hongKongBusinessRegistered
      ) && input.nonSubvented &&
        validMoney(input.eligibleAppliedRdOrPartnershipExpenditureHkd) &&
        input.eligibleAppliedRdOrPartnershipExpenditureHkd > 0;
  }
}

export function evaluateFundingEligibility(
  input: FundingEligibilityInput,
  locale: FundingLocale,
) {
  if (locale !== "en" && locale !== "zh-HK") {
    throw new Error("FUNDING_LOCALE_INVALID");
  }
  return FUNDING_SCHEMES.map((scheme) => Object.freeze({
    id: scheme.id,
    name: scheme.name[locale],
    summary: scheme.summary[locale],
    sourceUrl: scheme.sourceUrls[locale],
    potentiallyEligible: eligibility(scheme.id, input),
    disclaimer: FUNDING_VERIFY_CURRENT_TERMS[locale],
    asOf: FUNDING_AS_OF,
  }));
}
