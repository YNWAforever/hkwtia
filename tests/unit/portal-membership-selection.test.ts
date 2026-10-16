import {describe, expect, it} from "vitest";

import {getDashboard, type DashboardMembership, type PortalQueryDependencies} from "@/lib/portal/queries";

const actor = {kind: "member", userId: "auth-user", profileId: "profile-a"} as const;
const active: DashboardMembership = {
  id: "active-a", ownerUserId: null, companyId: "company-active", applicationId: null,
  planCode: "corporate", status: "active", seatLimit: 25, cancelAtPeriodEnd: false,
  billingPeriodStart: null, billingPeriodEnd: new Date("2027-01-15T00:00:00Z"),
};
const due: DashboardMembership = {
  ...active, id: "due", companyId: "company-due", planCode: "startup", status: "past_due",
  seatLimit: 5, cancelAtPeriodEnd: true, billingPeriodEnd: new Date("2026-10-01T00:00:00Z"),
};
const otherActive: DashboardMembership = {...active, id: "active-z", companyId: null, planCode: "community", seatLimit: 1};

function dependencies(rows: DashboardMembership[]): PortalQueryDependencies {
  return {
    memberships: {list: async () => rows},
    profiles: {getById: async (_actor, id) => {
      if (id !== "profile-a") throw new Error("WRONG_PROFILE");
      return {id, displayName: "Ada", phone: null, jobTitle: null, locale: "en", onboardingState: "complete", directoryVisible: false, whatsappNumber: null, whatsappOptIn: false};
    }},
    companies: {getById: async (_actor, id) => ({id, legalName: id, displayName: id})},
    getCompanyRole: async () => "owner",
  };
}

describe("dashboard membership identity", () => {
  // Catches query order changing the selected active record, not just its status.
  it.each([
    [due, active, otherActive], [due, otherActive, active], [active, due, otherActive],
    [active, otherActive, due], [otherActive, due, active], [otherActive, active, due],
  ])("keeps plan, company, seats and dates on the same stable primary membership (%#)", async (...rows) => {
    const result = await getDashboard(actor, dependencies(rows));
    expect(result).toMatchObject({
      primaryMembershipId: "active-a", primaryStatus: "active",
      primaryMembership: {id: "active-a", companyId: "company-active", planCode: "corporate", seatLimit: 25, cancelAtPeriodEnd: false, billingPeriodEnd: new Date("2027-01-15T00:00:00Z")},
    });
  });

  it("does not borrow a date from a different membership when the selected date is unknown", async () => {
    const result = await getDashboard(actor, dependencies([due, {...active, billingPeriodEnd: null}]));
    expect(result).toMatchObject({primaryMembership: {id: "active-a", billingPeriodEnd: null}});
  });

  it("preserves inactive recovery when there is no recoverable membership", async () => {
    await expect(getDashboard(actor, dependencies([]))).rejects.toThrow("MEMBERSHIP_INACTIVE");
  });
});
