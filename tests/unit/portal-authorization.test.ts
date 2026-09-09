import {describe, expect, it} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import {
  getDashboard,
  type PortalQueryDependencies,
} from "@/lib/portal/queries";
import {
  updateCompany,
  updateProfile,
  type PortalCommandDependencies,
} from "@/lib/portal/command-core";

const member: Extract<Actor, {kind: "member"}> = {kind: "member", userId: "user-a", profileId: "user-a"};
const anonymous: Extract<Actor, {kind: "anonymous"}> = {kind: "anonymous", userId: null};

function dependencies(overrides: Record<string, unknown> = {}) {
  const profile = {
    id: "user-a",
    displayName: "Ada Member",
    phone: null,
    jobTitle: null,
    locale: "en",
    onboardingState: "profile",
    directoryVisible: false,
  };
  const membership = {
    id: "membership-a",
    ownerUserId: "user-a",
    companyId: null,
    applicationId: "application-a",
    planCode: "community" as const,
    status: "active" as const,
    seatLimit: 1,
    cancelAtPeriodEnd: false,
    billingPeriodStart: null,
    billingPeriodEnd: null,
  };
  return {
    profiles: {
      async getById() { return profile; },
      async update(_actor: Actor, userId: string, input: Record<string, unknown>) {
        if (userId !== "user-a") throw new Error("FORBIDDEN");
        Object.assign(profile, input);
        return profile;
      },
    },
    memberships: {
      async list() { return [membership]; },
    },
    companies: {
      async getById() { return null; },
      async update(_actor: Actor, companyId: string, input: Record<string, unknown>) {
        if (companyId !== "company-a") throw new Error("FORBIDDEN");
        return {id: companyId, legalName: "Company A", displayName: input.displayName ?? "Company A"};
      },
    },
    ...overrides,
  } as unknown as PortalQueryDependencies & PortalCommandDependencies;
}

describe("protected member portal", () => {
  it("denies anonymous actors before reading private dashboard data", async () => {
    const deps = dependencies({
      profiles: {getById: async () => { throw new Error("PRIVATE_READ"); }},
      memberships: {list: async () => { throw new Error("PRIVATE_READ"); }},
    });

    await expect(getDashboard(anonymous, deps)).rejects.toThrow("FORBIDDEN");
  });

  it("returns the member's active status and onboarding next action", async () => {
    const dashboard = await getDashboard(member, dependencies());

    expect(dashboard.memberships[0]).toMatchObject({planCode: "community", status: "active"});
    expect(dashboard.onboarding.nextAction).toBe("complete-profile");
    expect(dashboard.privateDataAvailable).toBe(true);
  });

  it.each(["active", "past_due", "pending_review"] as const)("returns the recoverable %s dashboard status", async (status) => {
    const deps = dependencies({
      memberships: {
        async list() { return [{id: `membership-${status}`, ownerUserId: "user-a", companyId: null, applicationId: `application-${status}`, planCode: "community" as const, status, seatLimit: 1, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}]; },
      },
    });

    await expect(getDashboard(member, deps)).resolves.toMatchObject({primaryStatus: status, memberships: [{status}]});
  });

  it("excludes revoked company membership roles from dashboard management", async () => {
    const deps = dependencies({
      memberships: {
        async list() { return [{id: "membership-company-a", ownerUserId: null, companyId: "company-a", applicationId: "application-company-a", planCode: "corporate" as const, status: "active" as const, seatLimit: 5, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}]; },
      },
      companies: {getById: async () => ({id: "company-a", legalName: "Company A", displayName: "Company A"})},
      getCompanyRole: async () => null,
    });

    const dashboard = await getDashboard(member, deps);
    expect(dashboard.companies).toMatchObject([{id: "company-a", role: null, canManage: false}]);
    // A row read before 0028 (or a fake that omits the columns) is NOT published:
    // defaulting the other way would put unreviewed copy on /members (B-7).
    expect(dashboard.companies[0]).toMatchObject({publicProfileStatus: "hidden", slug: null, tags: [], logoMediaId: null});
  });

  it("carries the public member page's own copy onto the dashboard company (B-7)", async () => {
    const deps = dependencies({
      memberships: {
        async list() { return [{id: "membership-company-a", ownerUserId: null, companyId: "company-a", applicationId: "application-company-a", planCode: "corporate" as const, status: "active" as const, seatLimit: 5, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}]; },
      },
      companies: {
        async getById() {
          return {
            id: "company-a", legalName: "Company A", displayName: "Company A", website: "https://company-a.example",
            slug: "company-a", tags: ["ai", "logistics"], taglineEn: "Ships things", taglineZhHk: "運送",
            descriptionZhHk: "簡介", logoMediaId: "44444444-4444-4444-8444-444444444444",
            publicProfileStatus: "rejected" as const, profileRejectionReason: "Add a Chinese tagline.",
          };
        },
      },
      getCompanyRole: async () => "owner" as const,
    });

    // /portal/company renders the profile form's defaults from these fields, so
    // a projection that dropped one would silently blank it on the next save.
    const dashboard = await getDashboard(member, deps);
    expect(dashboard.companies[0]).toMatchObject({
      canManage: true, slug: "company-a", tags: ["ai", "logistics"], taglineEn: "Ships things", taglineZhHk: "運送",
      descriptionZhHk: "簡介", logoMediaId: "44444444-4444-4444-8444-444444444444",
      publicProfileStatus: "rejected", profileRejectionReason: "Add a Chinese tagline.",
    });
  });

  it("does not load private data for cancelled or expired memberships", async () => {
    const deps = dependencies({
      memberships: {
        async list() { return [{id: "membership-cancelled", ownerUserId: "user-a", companyId: null, applicationId: "application-cancelled", planCode: "community" as const, status: "cancelled" as const, seatLimit: 1, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}]; },
      },
      companies: {
        async getById() { throw new Error("PRIVATE_READ"); },
      },
    });

    await expect(getDashboard(member, deps)).rejects.toThrow("MEMBERSHIP_INACTIVE");
  });

  it("allows a member to edit only their own profile", async () => {
    const deps = dependencies();

    await expect(updateProfile(member, {displayName: "Updated Ada"}, deps)).resolves.toMatchObject({displayName: "Updated Ada"});
    await expect(updateProfile({...member, profileId: "user-b"}, {displayName: "Nope"}, deps)).rejects.toThrow("FORBIDDEN");
  });

  it("allows company updates only for an owner or admin", async () => {
    const deps = dependencies({
      memberships: {
        async list() { return [{id: "membership-company-a", ownerUserId: null, companyId: "company-a", applicationId: "application-company-a", planCode: "corporate" as const, status: "active" as const, seatLimit: 5, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}]; },
      },
      companies: {
        async getById() { return {id: "company-a", legalName: "Company A", displayName: "Company A"}; },
        async update(actor: Actor, companyId: string, input: Record<string, unknown>) {
          if (actor.kind !== "member" || actor.companyRoles?.[companyId] !== "owner" && actor.companyRoles?.[companyId] !== "admin") throw new Error("FORBIDDEN");
          return {id: companyId, legalName: "Company A", displayName: input.displayName};
        },
      },
    });

    await expect(updateCompany({...member, companyRoles: {"company-a": "owner"}}, {companyId: "company-a", displayName: "Updated Co"}, deps)).resolves.toMatchObject({displayName: "Updated Co"});
    await expect(updateCompany({...member, companyRoles: {"company-a": "member"}}, {companyId: "company-a", displayName: "Nope"}, deps)).rejects.toThrow("FORBIDDEN");
  });
});
