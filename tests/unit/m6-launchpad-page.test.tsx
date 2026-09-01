import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  cohorts: [{
    id: "11111111-1111-4111-8111-111111111111",
    slug: "asean-2026",
    nameEn: "ASEAN Landing Cohort",
    nameZhHk: "ASEAN Landing Cohort",
    descriptionEn: "A practical route into ASEAN markets.",
    descriptionZhHk: "A practical route into ASEAN markets.",
    track: "Market entry",
    startsOn: "2026-10-01",
    endsOn: "2026-12-31",
    capacity: 20,
    feeHkd: 12_000,
    status: "open" as const,
  }],
  listPublicCohorts: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({
  cohortRepository: {
    listPublicCohorts: (...args: unknown[]) => state.listPublicCohorts(...args),
  },
}));

import LaunchPadPage, {dynamic} from "@/app/[locale]/(public)/launchpad/page";
import {CohortCalendar} from "@/components/marketing/cohort-calendar";
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
    state.listPublicCohorts.mockReset();
    state.listPublicCohorts.mockResolvedValue(state.cohorts);
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

  it("renders the localized partner empty state when the repository is unavailable", async () => {
    const markup = renderToStaticMarkup(await LaunchPadPage(pageProps("en")));

    expect(markup).toContain("partners.empty");
    expect(markup).not.toContain("private-contact@example.com");
    expect(markup).not.toContain("private-partner-notes");
    expect(markup).not.toContain("in_discussion");
    expect(markup).not.toContain("prospect");
  });

  it("passes the explicit anonymous actor to the database-backed cohort projection", async () => {
    await LaunchPadPage(pageProps("en"));

    expect(state.listPublicCohorts).toHaveBeenCalledWith({kind: "anonymous", userId: null});
  });

  it("forces dynamic rendering because the cohort calendar is database-backed", () => {
    expect(dynamic).toBe("force-dynamic");
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

  it("uses the localized no-end label when a cohort has no fixed end date", () => {
    const markup = renderToStaticMarkup(<CohortCalendar
      cohorts={[{...state.cohorts[0]!, endsOn: null}]}
      labels={{title: "Cohort calendar", empty: "No cohorts", starts: "Starts", ends: "Ends", noEnd: "No fixed end date", capacity: "Capacity", fee: "Fee", statuses: {planning: "Planning", open: "Open", active: "Active", completed: "Completed", archived: "Archived"}}}
      locale="en"
    />);

    expect(markup).toContain("No fixed end date");
  });
});
