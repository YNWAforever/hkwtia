import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {PersistedMembershipPlan} from "@/lib/membership/public-catalog";

const membershipPlans = vi.hoisted(() => ({list: vi.fn()}));
const localeState = vi.hoisted(() => ({locale: "en"}));

vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: membershipPlans}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string) => { localeState.locale = locale; },
  getTranslations: async () => (key: string) => {
    const messages: Record<string, Record<string, string>> = {
      en: {
        unavailable: "Membership is currently unavailable",
        "tiers.community.name": "Community",
        "tiers.community.description": "Community description",
        "priceLabels.free": "Free",
        "priceLabels.review": "Contact us",
        "cadenceLabels.annual": "per year",
        "cadenceLabels.monthly": "per month",
        "actions.join": "Choose this plan",
        "actions.contact": "Contact us",
      },
      "zh-HK": {
        unavailable: "會員計劃暫時未能提供",
        "tiers.community.name": "社群",
        "tiers.community.description": "社群簡介",
        "priceLabels.free": "免費",
        "priceLabels.review": "聯絡我們",
        "cadenceLabels.annual": "每年",
        "cadenceLabels.monthly": "每月",
        "actions.join": "選擇此計劃",
        "actions.contact": "聯絡我們",
      },
    };
    return messages[localeState.locale]?.[key] ?? key;
  },
}));

import MembershipPage, * as membershipPageModule from "@/app/[locale]/(public)/membership/page";

const community = {
  code: "community",
  audience: "individual",
  billingBehavior: "free",
  seatAllowance: 1,
  active: true,
  annualPriceHkd: 0,
  monthlyPriceHkd: null,
  stripePriceReference: null,
} satisfies PersistedMembershipPlan;

async function renderMembership(rows: readonly PersistedMembershipPlan[], locale: "en" | "zh-HK" = "en") {
  membershipPlans.list.mockResolvedValue(rows);
  return renderToStaticMarkup(await MembershipPage({params: Promise.resolve({locale})}));
}

describe("repository-backed Membership page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeState.locale = "en";
  });

  it("renders dynamically so persisted availability and pricing stay current", () => {
    expect((membershipPageModule as {dynamic?: string}).dynamic).toBe("force-dynamic");
  });

  it.each([
    ["en", "Membership is currently unavailable"],
    ["zh-HK", "會員計劃暫時未能提供"],
  ] as const)("shows one localized unavailable state for no valid %s tier", async (locale, message) => {
    const html = await renderMembership([], locale);

    expect(html.match(new RegExp(message, "g"))).toHaveLength(1);
  });

  it("uses the same unavailable state when the repository read fails", async () => {
    membershipPlans.list.mockRejectedValue(new Error("database private payload"));

    const html = renderToStaticMarkup(await MembershipPage({params: Promise.resolve({locale: "en"})}));

    expect(html.match(/Membership is currently unavailable/g)).toHaveLength(1);
  });

  it("renders only reconciled tiers with localized labels and persisted CTAs", async () => {
    const html = await renderMembership([community]);

    expect(membershipPlans.list).toHaveBeenCalledOnce();
    expect(html).toContain("Community");
    expect(html).toContain("Free");
    expect(html).toContain('href="/join?plan=community"');
    expect(html).not.toContain("Membership is currently unavailable");
  });
});
