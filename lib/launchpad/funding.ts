import {
  evaluateFundingEligibility,
  type FundingEligibilityInput,
  type FundingLocale,
} from "@/config/funding-schemes";

export const fundingQuestionKeys = [
  "sector",
  "stage",
  "market",
  "employees",
  "revenue",
] as const;

export type FundingQuestionKey = (typeof fundingQuestionKeys)[number];

export type FundingAnswers = Readonly<{
  sector: "trade" | "advanced-training" | "smart-production" | "life-health" | "ai-data-science" | "advanced-manufacturing-new-energy" | "research-development";
  stage: "business-registered-non-subvented" | "incorporated-non-subvented" | "incorporated-subvented";
  market: "hong-kong" | "covered-economy" | "global";
  employees: "standard" | "trainee-hk-pr";
  revenue: "under-100m" | "investment-100m-project-150m" | "eligible-rd-expenditure";
}>;

type FundingSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const allowedAnswers: Readonly<{[Key in FundingQuestionKey]: readonly FundingAnswers[Key][]}> = {
  sector: ["trade", "advanced-training", "smart-production", "life-health", "ai-data-science", "advanced-manufacturing-new-energy", "research-development"],
  stage: ["business-registered-non-subvented", "incorporated-non-subvented", "incorporated-subvented"],
  market: ["hong-kong", "covered-economy", "global"],
  employees: ["standard", "trainee-hk-pr"],
  revenue: ["under-100m", "investment-100m-project-150m", "eligible-rd-expenditure"],
};

const incompleteInput: FundingEligibilityInput = {
  hongKongIncorporated: false,
  hongKongBusinessRegistered: false,
  operatesInHongKong: false,
  nonSubvented: false,
  expansionProjectInCoveredEconomy: false,
  advancedTechnologyTraining: false,
  traineeHongKongPermanentResident: false,
  smartProductionLineInHongKong: false,
  targetSector: "other",
  enterpriseInvestmentHkd: 0,
  totalProjectCostHkd: 0,
  eligibleAppliedRdOrPartnershipExpenditureHkd: 0,
};

function readAnswer<Key extends FundingQuestionKey>(
  searchParams: FundingSearchParams,
  key: Key,
): FundingAnswers[Key] | null {
  const value = searchParams[key];
  if (typeof value !== "string" || !allowedAnswers[key].includes(value as never)) return null;
  return value as FundingAnswers[Key];
}

export function parseFundingAnswers(searchParams: FundingSearchParams): FundingAnswers | null {
  const sector = readAnswer(searchParams, "sector");
  const stage = readAnswer(searchParams, "stage");
  const market = readAnswer(searchParams, "market");
  const employees = readAnswer(searchParams, "employees");
  const revenue = readAnswer(searchParams, "revenue");
  if (!sector || !stage || !market || !employees || !revenue) return null;
  return {sector, stage, market, employees, revenue};
}

function inputFromAnswers(answers: FundingAnswers | null): FundingEligibilityInput {
  if (!answers) return incompleteInput;
  const incorporated = answers.stage !== "business-registered-non-subvented";
  const nonSubvented = answers.stage !== "incorporated-subvented";
  const isNiasInvestment = answers.revenue === "investment-100m-project-150m";
  return {
    hongKongIncorporated: incorporated,
    hongKongBusinessRegistered: true,
    operatesInHongKong: answers.market === "hong-kong" || answers.market === "covered-economy",
    nonSubvented,
    expansionProjectInCoveredEconomy: answers.market === "covered-economy",
    advancedTechnologyTraining: answers.sector === "advanced-training",
    traineeHongKongPermanentResident: answers.employees === "trainee-hk-pr",
    smartProductionLineInHongKong: answers.sector === "smart-production" && answers.market === "hong-kong",
    targetSector: answers.sector === "life-health" || answers.sector === "ai-data-science" || answers.sector === "advanced-manufacturing-new-energy" ? answers.sector : "other",
    enterpriseInvestmentHkd: isNiasInvestment ? 100_000_000 : 0,
    totalProjectCostHkd: isNiasInvestment ? 150_000_000 : 0,
    eligibleAppliedRdOrPartnershipExpenditureHkd: answers.revenue === "eligible-rd-expenditure" ? 1 : 0,
  };
}

export function getFundingResults(searchParams: FundingSearchParams, locale: FundingLocale) {
  return evaluateFundingEligibility(inputFromAnswers(parseFundingAnswers(searchParams)), locale);
}
