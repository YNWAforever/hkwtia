import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  cohorts: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "asean-2026",
      nameEn: "ASEAN Landing Cohort",
      nameZhHk: "東盟落地組別",
      descriptionEn: "A practical route into ASEAN markets.",
      descriptionZhHk: "進入東盟市場的實務路徑。",
      track: "Market entry",
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      capacity: 20,
      feeHkd: 12000,
      status: "open",
    },
  ],
  partners: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      organizationEn: "Singapore Trade Desk",
      organizationZhHk: "新加坡貿易服務台",
      market: "Singapore",
      region: "ASEAN",
      mouStatus: "signed",
      contact: "private-contact@example.com",
      notes: "private-partner-notes",
    },
  ],
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({
  cohortRepository: {
    listPublicCohorts: async () => state.cohorts,
    listPublicPartners: async () => state.partners,
  },
}));

import LaunchPadPage from "@/app/[locale]/(public)/launchpad/page";
import {FundingWizard} from "@/components/marketing/funding-wizard";

const labels = {
  formLabel: "Funding scheme picker",
  instructions: "Choose an answer for every question.",
  submit: "See matching schemes",
  questions: {
    sector: {label: "Project focus", options: {trade: "Trade", "advanced-training": "Training", "smart-production": "Smart production", "life-health": "Life and health", "ai-data-science": "AI", "advanced-manufacturing-new-energy": "Advanced manufacturing", "research-development": "Research and development"}},
    stage: {label: "Company status", options: {"business-registered-non-subvented": "Registered", "incorporated-non-subvented": "Incorporated", "incorporated-subvented": "Subvented"}},
    market: {label: "Project market", options: {"hong-kong": "Hong Kong", "covered-economy": "Covered economy", global: "Global"}},
    employees: {label: "Staff readiness", options: {standard: "Standard", "trainee-hk-pr": "Trainee is a Hong Kong permanent resident"}},
    revenue: {label: "Investment or expenditure", options: {"under-100m": "Under HK$100 million", "investment-100m-project-150m": "HK$100 million investment and HK$150 million project", "eligible-rd-expenditure": "Eligible R&D expenditure"}},
  },
  results: {heading: "Funding results", eligible: "Potentially eligible", ineligible: "Check details", source: "Official source", asOf: "As of", disclaimer: "Information only"},
};

function pageProps(locale: "en" | "zh-HK") {
  return {
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve({
      sector: "trade",
      stage: "business-registered-non-subvented",
      market: "covered-economy",
      employees: "standard",
      revenue: "under-100m",
    }),
  };
}

describe("M6 Launch Pad public experience", () => {
  beforeEach(() => {
    state.cohorts = [{
      id: "11111111-1111-4111-8111-111111111111", slug: "asean-2026", nameEn: "ASEAN Landing Cohort", nameZhHk: "東盟落地組別", descriptionEn: "A practical route into ASEAN markets.", descriptionZhHk: "進入東盟市場的實務路徑。", track: "Market entry", startsOn: "2026-10-01", endsOn: "2026-12-31", capacity: 20, feeHkd: 12000, status: "open",
    }];
    state.partners = [{
      id: "22222222-2222-4222-8222-222222222222", organizationEn: "Singapore Trade Desk", organizationZhHk: "新加坡貿易服務台", market: "Singapore", region: "ASEAN", mouStatus: "signed", contact: "private-contact@example.com", notes: "private-partner-notes",
    }];
  });

  it.each(["en", "zh-HK"] as const)("renders the explainer, calendar, partner map, picker, results, and clinic CTA in %s", async (locale) => {
    const markup = renderToStaticMarkup(await LaunchPadPage(pageProps(locale)));

    expect(markup).toContain("program.title");
    expect(markup).toContain("calendar.title");
    expect(markup).toContain("partners.title");
    expect(markup).toContain("funding.formLabel");
    expect(markup).toContain("funding.results.heading");
    expect(markup).toContain("clinicCta");
  });

  it("renders a keyboard-accessible GET picker with all five stable answer controls", () => {
    const markup = renderToStaticMarkup(<FundingWizard locale="en" answers={null} labels={labels}/>);

    expect(markup).toContain('method="get"');
    for (const key of ["sector", "stage", "market", "employees", "revenue"]) {
      expect(markup).toContain(`name="${key}"`);
      expect(markup).toContain(`for="funding-${key}"`);
    }
    expect(markup).toContain('role="status"');
  });

  it("passes only public partner fields into the rendered map", async () => {
    const markup = renderToStaticMarkup(await LaunchPadPage(pageProps("en")));

    expect(markup).toContain("Singapore Trade Desk");
    expect(markup).not.toContain("private-contact@example.com");
    expect(markup).not.toContain("private-partner-notes");
  });
});
