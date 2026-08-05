import {describe, expect, it} from "vitest";

import {FUNDING_AS_OF, FUNDING_VERIFY_CURRENT_TERMS} from "@/config/funding-schemes";
import {
  fundingQuestionKeys,
  getFundingResults,
  parseFundingAnswers,
} from "@/lib/launchpad/funding";

const fixtures = [
  {
    id: "bud",
    query: {
      sector: "trade",
      stage: "business-registered-non-subvented",
      market: "covered-economy",
      employees: "standard",
      revenue: "under-100m",
    },
  },
  {
    id: "nittp",
    query: {
      sector: "advanced-training",
      stage: "business-registered-non-subvented",
      market: "hong-kong",
      employees: "trainee-hk-pr",
      revenue: "under-100m",
    },
  },
  {
    id: "nifs",
    query: {
      sector: "smart-production",
      stage: "incorporated-non-subvented",
      market: "hong-kong",
      employees: "standard",
      revenue: "under-100m",
    },
  },
  {
    id: "nias",
    query: {
      sector: "ai-data-science",
      stage: "incorporated-non-subvented",
      market: "hong-kong",
      employees: "standard",
      revenue: "investment-100m-project-150m",
    },
  },
  {
    id: "rd-cash-rebate",
    query: {
      sector: "research-development",
      stage: "incorporated-non-subvented",
      market: "hong-kong",
      employees: "standard",
      revenue: "eligible-rd-expenditure",
    },
  },
] as const;

describe("M6 funding picker adapter", () => {
  it.each(fixtures)("maps the $id fixture to its existing deterministic scheme", ({id, query}) => {
    const results = getFundingResults(query, "en");

    expect(results.map((result) => result.id)).toEqual([
      "bud",
      "nittp",
      "nifs",
      "nias",
      "rd-cash-rebate",
    ]);
    expect(results.filter((result) => result.potentiallyEligible).map((result) => result.id)).toEqual([id]);
  });

  it("preserves official sources, as-of information, and the current disclaimer", () => {
    const results = getFundingResults(fixtures[0].query, "en");

    expect(results.find((result) => result.id === "bud")).toMatchObject({
      sourceUrl: "https://www.smefund.tid.gov.hk/english/bud/bud_home.html",
      asOf: FUNDING_AS_OF,
      disclaimer: FUNDING_VERIFY_CURRENT_TERMS.en,
    });
    expect(results.find((result) => result.id === "rd-cash-rebate")).toMatchObject({
      sourceUrl: "https://www.itf.gov.hk/filemanager/en/content_31/CRS_Guide_e_202507.pdf",
      asOf: FUNDING_AS_OF,
      disclaimer: FUNDING_VERIFY_CURRENT_TERMS.en,
    });
  });

  it("treats blank or invalid queries as incomplete rather than claiming eligibility", () => {
    expect(parseFundingAnswers({})).toBeNull();
    expect(parseFundingAnswers({...fixtures[0].query, market: "invalid"})).toBeNull();
    expect(getFundingResults({}, "zh-HK").some((result) => result.potentiallyEligible)).toBe(false);
  });

  it("keeps the five stable query keys in their user-facing order", () => {
    expect(fundingQuestionKeys).toEqual(["sector", "stage", "market", "employees", "revenue"]);
  });
});
