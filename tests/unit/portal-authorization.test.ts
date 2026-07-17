import {describe, expect, it} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import {
  buildPortalSignInPath,
  getDashboard,
  type PortalQueryDependencies,
} from "@/lib/portal/queries";
import {
  updateCompany,
  updateProfile,
  type PortalCommandDependencies,
} from "@/lib/portal/commands";

const member: Extract<Actor, {kind: "member"}> = {kind: "member", userId: "user-a"};
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
    await expect(updateProfile({...member, userId: "user-b"}, {displayName: "Nope"}, deps)).rejects.toThrow("FORBIDDEN");
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

  it("builds a locale-aware sign-in continuation and rejects open redirects", () => {
    expect(buildPortalSignInPath("en", "/portal")).toBe("/join?next=%2Fportal");
    expect(buildPortalSignInPath("zh-HK", "/portal/profile")).toBe("/zh/join?next=%2Fportal%2Fprofile");
    expect(() => buildPortalSignInPath("en", "https://evil.example/steal")).toThrow("INVALID_CONTINUATION");
  });
});
