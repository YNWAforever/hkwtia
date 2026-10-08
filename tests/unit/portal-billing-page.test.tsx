import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({dashboardFails: false, seatLimit: 3}));

vi.mock("next-intl/server", () => ({setRequestLocale: vi.fn(), getTranslations: async () => (key: string) => `t:${key}`}));
vi.mock("next/navigation", async (importOriginal) => ({...(await importOriginal<typeof import("next/navigation")>()), redirect: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "u1", profileId: "p1"})}));
vi.mock("@/lib/billing/checkout-service", () => ({createBillingPortalSession: vi.fn(), createCheckoutSession: vi.fn()}));
vi.mock("@/lib/membership/policy", () => ({policyAcceptanceEnabled: () => false}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {}}));
vi.mock("@/lib/portal/billing-summary", () => ({
  getBillingSummary: async () => ({
    membershipId: "m1", status: "active", canManageBilling: true, recovery: "resume", subscriptionRef: "sub", 
    memberships: [{id: "m1", planCode: "startup", status: "active", companyId: null, canManageBilling: true, recovery: "resume", subscriptionRef: "sub", canViewHistory: true, providerAvailable: true}],
  }),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: async () => {
    if (state.dashboardFails) throw new Error("dashboard down");
    return {memberships: [{id: "m1", status: "active", seatLimit: state.seatLimit, cancelAtPeriodEnd: false, billingPeriodEnd: new Date("2026-11-12T00:00:00Z")}]};
  },
}));

import BillingPage from "@/app/[locale]/(member)/portal/billing/page";

const render = async (query: Record<string, string>) =>
  renderToStaticMarkup(await BillingPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(query)}));

describe("billing page", () => {
  it("renders ?error=1 as an alert", async () => {
    state.dashboardFails = false;
    const markup = await render({error: "1"});
    expect(markup).toMatch(/class="portal-form-alert"[^>]*role="alert"|role="alert"[^>]*class="portal-form-alert"/);
    expect(markup).toContain("t:billing.error");
    expect(await render({})).not.toContain("t:billing.error");
  });

  it("still renders the membership card, without renewal or seat lines, when the dashboard read fails", async () => {
    state.dashboardFails = false;
    expect(await render({})).toContain("t:billing.renewsOn");
    state.dashboardFails = true;
    const markup = await render({});
    expect(markup).toContain("t:billing.planHeading");
    expect(markup).toContain("t:billing.manage");
    expect(markup).not.toContain("t:billing.renewsOn");
    expect(markup).not.toContain("t:billing.seats");
  });

  it("omits the seat line for a membership with seatLimit 0", async () => {
    state.dashboardFails = false;
    state.seatLimit = 3;
    expect(await render({})).toContain("t:billing.seats");
    state.seatLimit = 0;
    const markup = await render({});
    expect(markup).not.toContain("t:billing.seats");
    expect(markup).toContain("t:billing.renewsOn");
    state.seatLimit = 3;
  });

  it("titles the card through billing.planHeading", async () => {
    state.dashboardFails = false;
    expect(await render({})).toContain("<h2>t:billing.planHeading</h2>");
  });
});
