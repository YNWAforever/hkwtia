import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  listPublicCohorts: vi.fn(),
  listPublishedPartners: vi.fn(),
  partners: [{
    id: "22222222-2222-4222-8222-222222222222",
    organizationEn: "Repository Partner",
    organizationZhHk: "資料庫夥伴",
    market: "Hong Kong",
    region: "Asia Pacific",
    contact: {email: "private-contact@example.com"},
    notes: "private-negotiation-notes",
    mouStatus: "signed",
  }],
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
vi.mock("@/lib/db/repos/landing-partners", () => ({
  landingPartnersRepository: {
    listPublished: (...args: unknown[]) => state.listPublishedPartners(...args),
  },
}));

import LaunchPadPage from "@/app/[locale]/(public)/launchpad/page";
import {HIDE_STATEMENTS} from "../../scripts/audit-synthetic-content.ts";

function pageProps(locale: "en" | "zh-HK" = "en") {
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

describe("Launch Pad landing-partner repository cutover", () => {
  beforeEach(() => {
    state.listPublicCohorts.mockReset();
    state.listPublicCohorts.mockResolvedValue([]);
    state.listPublishedPartners.mockReset();
    state.listPublishedPartners.mockResolvedValue(state.partners);
  });

  it("loads exactly the public repository projection and never imports static partners", async () => {
    const markup = renderToStaticMarkup(await LaunchPadPage(pageProps()));
    const pageSource = readFileSync(
      join(process.cwd(), "app", "[locale]", "(public)", "launchpad", "page.tsx"),
      "utf8",
    );

    expect(state.listPublishedPartners).toHaveBeenCalledWith({limit: 100});
    expect(markup).toContain("Repository Partner");
    expect(pageSource).not.toContain("config/landing-partners");
    expect(existsSync(join(process.cwd(), "config", "landing-partners.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "config", "landing-partners.json"))).toBe(false);
  });

  it("does not disclose contact or notes and renders one localized empty state on zero/error", async () => {
    const markup = renderToStaticMarkup(await LaunchPadPage(pageProps("zh-HK")));

    expect(markup).toContain("資料庫夥伴");
    expect(markup).not.toContain("private-contact@example.com");
    expect(markup).not.toContain("private-negotiation-notes");
    expect(markup).not.toContain("signed");

    state.listPublishedPartners.mockResolvedValueOnce([]);
    const emptyMarkup = renderToStaticMarkup(await LaunchPadPage(pageProps()));
    expect(emptyMarkup.match(/partners\.empty/g)).toHaveLength(1);
    expect(emptyMarkup).not.toContain("Repository Partner");

    state.listPublishedPartners.mockRejectedValueOnce(new Error("database unavailable"));
    const errorMarkup = renderToStaticMarkup(await LaunchPadPage(pageProps()));
    expect(errorMarkup.match(/partners\.empty/g)).toHaveLength(1);
    expect(errorMarkup).not.toContain("Repository Partner");
  });

  it("hides only M6 partner rows by clearing published_at with a parameterized UUID array", () => {
    expect(HIDE_STATEMENTS).toContainEqual({
      table: "landing_partners",
      sql: "UPDATE landing_partners SET published_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
      matchType: "uuid",
    });
  });
});
