import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {startJoin} from "@/lib/membership/join-service";
import {completeApplication} from "@/lib/membership/onboarding";
import type {JourneyEnrollment} from "@/lib/db/repos/journeys";
import type {Actor} from "@/lib/membership/lifecycle";
import type {BillingInterval} from "@/lib/membership/catalog";

const actor: Extract<Actor, {kind: "member"}> = {kind: "member", userId: "user-a", profileId: "user-a"};

type TestPlan = "community" | "startup" | "corporate" | "patron";
type TestApplication = {
  id: string;
  applicantUserId: string;
  companyId: string | null;
  planCode: TestPlan;
  currentStep: "profile" | "company" | "checkout" | "complete" | "review";
  status: "draft" | "pending_payment" | "pending_review" | "completed" | "abandoned";
};
type TestMembership = {
  id: string;
  applicationId: string | null;
  planCode: TestPlan;
  status: "pending_payment" | "pending_review" | "active";
  ownerUserId: string | null;
  companyId: string | null;
  seatLimit: number;
  billingInterval: BillingInterval;
  createdAt: Date;
  updatedAt: Date;
};

function harness() {
  const applications = new Map<string, TestApplication>();
  const memberships: TestMembership[] = [];
  const enrollmentRows = new Map<string, JourneyEnrollment>();
  const enrollmentActors: Actor[] = [];
  const membershipActors: Actor[] = [];
  let nextId = 1;

  return {
    applications: {
      async getById(_actor: Actor, id: string) {
        return applications.get(id) ?? null;
      },
      async create(_actor: Actor, input: Record<string, unknown>) {
        const application: TestApplication = {
          id: `application-${nextId++}`,
          applicantUserId: actor.userId,
          companyId: null,
          currentStep: "profile",
          status: "draft",
          planCode: input.planCode as TestPlan,
          ...(input.companyId ? {companyId: input.companyId as string} : {}),
          ...(input.currentStep ? {currentStep: input.currentStep as TestApplication["currentStep"]} : {}),
          ...(input.status ? {status: input.status as TestApplication["status"]} : {}),
        };
        applications.set(application.id, application);
        return application;
      },
      async update(_actor: Actor, id: string, input: Record<string, unknown>) {
        const application = applications.get(id);
        if (!application) return null;
        Object.assign(application, input);
        return application;
      },
    },
    memberships: {
      async getByApplicationId(_actor: Actor, applicationId: string) {
        return memberships.find((membership) => membership.applicationId === applicationId) ?? null;
      },
      async create(membershipActor: Actor, input: Record<string, unknown>) {
        membershipActors.push(membershipActor);
        const membership: TestMembership = {
          id: `membership-${memberships.length + 1}`,
          applicationId: input.applicationId as string,
          planCode: input.planCode as TestPlan,
          status: input.status as TestMembership["status"],
          ownerUserId: (input.ownerUserId as string | null) ?? null,
          companyId: (input.companyId as string | null) ?? null,
          seatLimit: input.seatLimit as number,
          billingInterval: input.billingInterval as BillingInterval,
          createdAt: new Date("2026-07-26T04:00:00.000Z"),
          updatedAt: new Date("2026-07-26T04:00:00.000Z"),
        };
        memberships.push(membership);
        return membership;
      },
    },
    journeys: {
      async enroll(enrollmentActor: Actor, enrollment: JourneyEnrollment) {
        enrollmentActors.push(enrollmentActor);
        const key = [enrollment.profileId, enrollment.journey, enrollment.instanceKey, enrollment.step].join("|");
        if (enrollmentRows.has(key)) return "existing" as const;
        enrollmentRows.set(key, enrollment);
        return "created" as const;
      },
    },
    now: () => new Date("2026-07-26T04:00:00.000Z"),
    inspect: () => ({applications, memberships, enrollmentRows, enrollmentActors, membershipActors}),
  };
}

describe("membership join orchestration", () => {
  // The "corporate" checkout fixture below needs resolveMembershipOption() (catalog.ts) to see
  // a configured Stripe price mapping for the "annual" interval, or completeApplication() fails
  // closed with UNSUPPORTED_BILLING_INTERVAL before reaching the behavior under test.
  beforeEach(() => {
    vi.stubEnv("STRIPE_STARTUP_PRICE_ID", "price_startup");
    vi.stubEnv("STRIPE_CORPORATE_PRICE_ID", "price_corporate");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a draft and reuses it when a join page is refreshed", async () => {
    const deps = harness();
    const first = await startJoin(actor, {plan: "startup", applicationId: null}, deps);
    const second = await startJoin(actor, {plan: "startup", applicationId: first.applicationId}, deps);

    expect(first).toEqual({applicationId: first.applicationId, next: "profile"});
    expect(second).toEqual(first);
    expect(deps.inspect().applications.size).toBe(1);
  });

  it("activates community without creating a checkout session", async () => {
    const deps = harness();
    const result = await completeApplication(
      actor,
      {
        plan: "community",
        billingInterval: "none",
        profile: {displayName: "Community Member"},
        company: null,
      },
      deps,
    );

    expect(result.next).toBe("complete");
    expect(result.checkout).toBeUndefined();
    expect(deps.inspect().memberships).toMatchObject([{planCode: "community", status: "active", billingInterval: "none"}]);
    expect([...deps.inspect().enrollmentRows.values()]).toContainEqual(expect.objectContaining({
      profileId: actor.profileId,
      journey: "onboarding_90d",
      instanceKey: `activation:${result.membershipId}`,
      step: "welcome",
    }));
    expect(deps.inspect().membershipActors).toEqual([actor]);
    expect(deps.inspect().enrollmentActors.every((value) => value.kind === "system")).toBe(true);

    await completeApplication(
      actor,
      {
        applicationId: result.applicationId,
        plan: "community",
        billingInterval: "none",
        profile: {displayName: "Community Member"},
        company: null,
      },
      deps,
    );
    expect(deps.inspect().enrollmentRows).toHaveLength(9);
  });

  it("returns a typed checkout command for paid plans without activating them", async () => {
    const deps = harness();
    const result = await completeApplication(
      actor,
      {
        plan: "corporate",
        billingInterval: "annual",
        profile: {displayName: "Corporate Member"},
        company: {id: "company-a", legalName: "Corporate Ltd", displayName: "Corporate"},
      },
      deps,
    );

    expect(result.next).toBe("checkout");
    expect(result.checkout).toMatchObject({kind: "membership_checkout", planCode: "corporate"});
    expect(deps.inspect().memberships).toMatchObject([{planCode: "corporate", status: "pending_payment", billingInterval: "annual"}]);
  });

  it("sends patron applications to review without creating a charge", async () => {
    const deps = harness();
    const result = await completeApplication(
      actor,
      {
        plan: "patron",
        billingInterval: "none",
        profile: {displayName: "Patron"},
        company: null,
      },
      deps,
    );

    expect(result.next).toBe("review");
    expect(result.checkout).toBeUndefined();
    expect(deps.inspect().memberships).toMatchObject([{planCode: "patron", status: "pending_review", billingInterval: "none"}]);
  });
});

describe("completeApplication validates billingInterval before any mutation", () => {
  it("rejects an unsupported interval for a paid plan before creating an application or profile", async () => {
    const deps = harness();

    await expect(
      completeApplication(
        actor,
        {
          plan: "startup",
          billingInterval: "monthly" as BillingInterval,
          applicationId: null,
          profile: {displayName: "Test User"},
          company: {id: "company-a", legalName: "Startup Ltd", displayName: "Startup"},
        },
        deps,
      ),
    ).rejects.toThrow();

    const state = deps.inspect();
    expect(state.applications.size).toBe(0);
    expect(state.memberships).toHaveLength(0);
  });
});
