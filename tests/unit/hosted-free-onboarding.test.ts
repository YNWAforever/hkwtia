import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import type {BillingInterval} from "@/lib/membership/catalog";
import {completeApplication, type JoinApplication, type JoinDependencies, type JoinMembership} from "@/lib/membership/onboarding";

vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {}}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {}}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {}}));
vi.mock("@/lib/db/repos/journeys", () => ({journeysRepository: {}}));
vi.mock("@/lib/db/repos/contacts", () => ({contactsRepository: {}}));
vi.mock("@/lib/membership/policy-acceptance", () => ({
  requirePolicyAcceptanceForApplication: async () => undefined,
}));
vi.mock("@/lib/automation/enrollment", () => ({enrollActivatedMembership: async () => undefined}));
vi.mock("@/lib/membership/contact-member-flip", () => ({flipContactOnActivation: async () => undefined}));

const actor: Extract<Actor, {kind: "member"}> = {
  kind: "member", userId: "synthetic-free-member", profileId: "synthetic-free-member",
};

function harness() {
  const profiles = new Map<string, {displayName: string; locale?: string}>();
  const applications = new Map<string, JoinApplication>();
  const memberships: (JoinMembership & {billingInterval: BillingInterval})[] = [];
  const dependencies: JoinDependencies = {
    profiles: {
      ensure: async (_actor, input) => { profiles.set(input.id, input); },
    },
    applications: {
      getById: async (_actor, id) => applications.get(id) ?? null,
      create: async (_actor, input) => {
        const application: JoinApplication = {
          id: `application-${applications.size + 1}`,
          applicantUserId: actor.profileId,
          planCode: input.planCode as JoinApplication["planCode"],
          currentStep: "profile",
          status: "draft",
        };
        applications.set(application.id, application);
        return application;
      },
      update: async (_actor, id, input) => {
        const current = applications.get(id);
        if (!current) return null;
        Object.assign(current, input);
        return current;
      },
    },
    memberships: {
      getByApplicationId: async (_actor, id) => memberships.find((row) => row.applicationId === id) ?? null,
      create: async (_actor, input) => {
        const membership = {
          id: `membership-${memberships.length + 1}`,
          applicationId: input.applicationId as string,
          planCode: input.planCode as JoinMembership["planCode"],
          status: input.status as JoinMembership["status"],
          ownerUserId: input.ownerUserId as string | null,
          companyId: input.companyId as string | null,
          seatLimit: input.seatLimit as number,
          billingInterval: input.billingInterval as BillingInterval,
        };
        memberships.push(membership);
        return membership;
      },
    },
  };
  return {dependencies, profiles, applications, memberships};
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "preview");
  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_STARTUP_PRICE_ID", "STRIPE_CORPORATE_PRICE_ID"]) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(() => vi.unstubAllEnvs());

describe("production-mode onboarding without unrelated billing secrets", () => {
  it.each([
    ["community", "en", "complete", "active", "completed"],
    ["community", "zh-HK", "complete", "active", "completed"],
  ] as const)("completes %s setup in %s without Stripe configuration", async (plan, locale, next, status, applicationStatus) => {
    const state = harness();
    const result = await completeApplication(actor, {
      plan, billingInterval: "none", profile: {displayName: "Synthetic Member", locale},
    }, state.dependencies);

    expect(result).toEqual({applicationId: "application-1", next, membershipId: "membership-1"});
    expect(state.profiles.get(actor.profileId)).toMatchObject({displayName: "Synthetic Member", locale});
    expect(state.memberships).toEqual([{
      id: "membership-1", applicationId: "application-1", planCode: plan, status,
      ownerUserId: actor.profileId, companyId: null, seatLimit: 1, billingInterval: "none",
    }]);
    expect(state.applications.get("application-1")).toMatchObject({currentStep: next, status: applicationStatus});
  });

  it.each(["en", "zh-HK"] as const)("holds a patron application for review without Stripe configuration in %s", async (locale) => {
    const state = harness();
    const result = await completeApplication(actor, {
      plan: "patron",
      billingInterval: "none",
      profile: {displayName: "Synthetic Member", locale},
      company: {id: "synthetic-company", legalName: "Synthetic Company", displayName: "Synthetic Company"},
    }, state.dependencies);

    expect(result).toEqual({applicationId: "application-1", next: "review", membershipId: "membership-1"});
    expect(state.memberships).toEqual([{
      id: "membership-1", applicationId: "application-1", planCode: "patron", status: "pending_review",
      ownerUserId: null, companyId: "synthetic-company", seatLimit: 1, billingInterval: "none",
    }]);
  });

  it("holds a new corporate application for review without Stripe configuration", async () => {
    const state = harness();
    const result = await completeApplication(actor, {
      plan: "corporate",
      billingInterval: "none",
      profile: {displayName: "Synthetic Member"},
      company: {id: "synthetic-company", legalName: "Synthetic Company", displayName: "Synthetic Company"},
    }, state.dependencies);
    expect(result.next).toBe("review");
    expect(result.checkout).toBeUndefined();
    expect(state.memberships[0]).toMatchObject({status: "pending_review", billingInterval: "none", planCode: "corporate"});
  });

  it.each(["community", "patron"])("rejects a paid interval for %s before any write", async (plan) => {
    const state = harness();
    await expect(completeApplication(actor, {
      plan, billingInterval: "annual", profile: {displayName: "Synthetic Member"},
    }, state.dependencies)).rejects.toThrow("UNSUPPORTED_BILLING_INTERVAL");
    expect(state.profiles.size).toBe(0);
    expect(state.applications.size).toBe(0);
    expect(state.memberships).toHaveLength(0);
  });

  it("rejects an annual interval for corporate before any write", async () => {
    const state = harness();
    await expect(completeApplication(actor, {
      plan: "corporate", billingInterval: "annual", profile: {displayName: "Synthetic Member"},
      company: {id: "synthetic-company", legalName: "Synthetic Company", displayName: "Synthetic Company"},
    }, state.dependencies)).rejects.toThrow("UNSUPPORTED_BILLING_INTERVAL");
    expect(state.profiles.size).toBe(0);
    expect(state.applications.size).toBe(0);
    expect(state.memberships).toHaveLength(0);
  });

  it.each(["startup"])("requires billing configuration for %s before writes", async (plan) => {
    const state = harness();
    await expect(completeApplication(actor, {
      plan, billingInterval: "annual", profile: {displayName: "Synthetic Member"},
      company: {id: "synthetic-company", legalName: "Synthetic Company", displayName: "Synthetic Company"},
    }, state.dependencies)).rejects.toThrow("Missing required production environment variables: STRIPE_SECRET_KEY");
    expect(state.profiles.size).toBe(0);
    expect(state.applications.size).toBe(0);
    expect(state.memberships).toHaveLength(0);
  });

  it("reuses the persisted free membership on completion replay", async () => {
    const state = harness();
    const input = {plan: "community", billingInterval: "none", profile: {displayName: "Synthetic Member"}};
    const first = await completeApplication(actor, input, state.dependencies);
    const replay = await completeApplication(actor, {...input, applicationId: first.applicationId}, state.dependencies);
    expect(replay).toEqual(first);
    expect(state.applications.size).toBe(1);
    expect(state.memberships).toHaveLength(1);
  });

  it("retains the authenticated-actor boundary", async () => {
    const state = harness();
    await expect(completeApplication({kind: "anonymous", userId: null}, {
      plan: "community", billingInterval: "none", profile: {displayName: "Synthetic Member"},
    }, state.dependencies)).rejects.toThrow("UNAUTHORIZED");
    expect(state.profiles.size).toBe(0);
    expect(state.memberships).toHaveLength(0);
  });
});
