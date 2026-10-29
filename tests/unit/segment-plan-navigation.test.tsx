import {render, screen, within} from "@testing-library/react";
import {createTranslator} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({locale, namespace}: {locale: string; namespace: "Admin.segments" | "Admin.contacts"}) =>
    createTranslator({locale, messages: locale === "zh-HK" ? zh : en, namespace}),
}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/admin/segments", () => ({previewSegment: async () => ({total: 0, items: [], nextCursor: null})}));
vi.mock("@/lib/db/repos/segments", () => ({segmentsRepository: {list: async () => []}}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listForAdmin: async () => []}, localizeEvent: (event: unknown) => event}));
vi.mock("@/lib/admin/segment-actions", () => ({saveSegmentAction: vi.fn()}));
vi.mock("@/lib/admin/campaign-actions", () => ({queueCampaignAction: vi.fn()}));

import SegmentsPage from "@/app/[locale]/(admin)/admin/segments/page";

const draft = "00000000-0000-4000-8000-000000001003";

describe.each(["en", "zh-HK"] as const)("segment plan form in %s", (locale) => {
  const labels = (locale === "zh-HK" ? zh : en).Admin.segments;

  it.each(["individual", "platinum"] as const)("retains the %s audience through both plan controls", async (plan) => {
    render(await SegmentsPage({
      params: Promise.resolve({locale}),
      searchParams: Promise.resolve({tier: plan, companyPlan: plan, campaignDraft: draft}),
    }));
    const tier = screen.getByLabelText(labels.tier);
    const data = new FormData(tier.closest("form")!);
    // Submitting a preview must never turn a paid-plan filter into an empty (all-member) filter.
    expect(data.getAll("tier")).toEqual([plan]);
    expect(data.getAll("companyPlan")).toEqual([plan]);
    const parsed = parseSegmentRouteQuery({tier: data.getAll("tier"), companyPlan: data.getAll("companyPlan")});
    expect(parsed.filter.tier).toEqual([plan]);
    expect(parsed.filter.companyPlan).toEqual([plan]);
  });

  it("offers every stored code with distinct labels", async () => {
    render(await SegmentsPage({
      params: Promise.resolve({locale}),
      searchParams: Promise.resolve({campaignDraft: draft}),
    }));
    for (const label of [labels.tier, labels.companyPlan]) {
      const options = within(screen.getByLabelText(label)).getAllByRole("option") as HTMLOptionElement[];
      expect(options.map((option) => option.value)).toEqual([...MEMBERSHIP_PLAN_CODES]);
      expect(new Set(options.map((option) => option.textContent)).size).toBe(MEMBERSHIP_PLAN_CODES.length);
    }
  });

  it("preserves an all-plan company filter", () => {
    expect(parseSegmentRouteQuery({companyPlan: [...MEMBERSHIP_PLAN_CODES]}).filter.companyPlan)
      .toEqual([...MEMBERSHIP_PLAN_CODES]);
  });
});
