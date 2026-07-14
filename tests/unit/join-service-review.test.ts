import {describe, expect, it} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import {completeApplication} from "@/lib/membership/onboarding";
import {startJoin} from "@/lib/membership/join-service";

const actor: Extract<Actor, {kind: "member"}> = {kind: "member", userId: "user-a"};

type Application = {
  id: string;
  applicantUserId: string;
  planCode: "community" | "startup" | "corporate" | "patron";
  companyId: string | null;
  currentStep: "profile" | "company" | "checkout" | "complete" | "review";
  status: "draft" | "pending_payment" | "pending_review" | "completed" | "abandoned";
};
type Membership = {
  id: string;
  applicationId: string;
  ownerUserId: string | null;
  companyId: string | null;
  planCode: Application["planCode"];
  status: "pending_payment" | "pending_review" | "active";
  seatLimit: number;
};

function durableHarness() {
  const profiles = new Map<string, {id: string; displayName: string}>();
  const applications = new Map<string, Application>();
  const memberships = new Map<string, Membership>();
  const companies = new Map([
    ["company-a", {id: "company-a", legalName: "Company A", displayName: "Company A"}],
    ["company-b", {id: "company-b", legalName: "Company B", displayName: "Company B"}],
  ]);
  const companyMembers = new Set(["user-a:company-a"]);
  let applicationSequence = 0;

  return {
    profiles: {
      async ensure(_actor: Actor, input: {id: string; displayName: string}) {
        const current = profiles.get(input.id) ?? input;
        profiles.set(input.id, {...current, ...input});
        return profiles.get(input.id)!;
      },
    },
    companies: {
      async getById(checkActor: Actor, companyId: string) {
        if (checkActor.kind === "member" && !companyMembers.has(`${checkActor.userId}:${companyId}`)) {
          throw new Error("FORBIDDEN");
        }
        return companies.get(companyId) ?? null;
      },
    },
    applications: {
      async getById(_actor: Actor, applicationId: string) {
        return applications.get(applicationId) ?? null;
      },
      async create(_actor: Actor, input: Record<string, unknown>) {
        const application: Application = {
          id: `application-${++applicationSequence}`,
          applicantUserId: actor.userId,
          planCode: input.planCode as Application["planCode"],
          companyId: (input.companyId as string | null) ?? null,
          currentStep: (input.currentStep as Application["currentStep"]) ?? "profile",
          status: (input.status as Application["status"]) ?? "draft",
        };
        applications.set(application.id, application);
        return application;
      },
      async setCompany(_actor: Actor, applicationId: string, companyId: string) {
        const application = applications.get(applicationId);
        if (!application) return null;
        application.companyId = companyId;
        return application;
      },
      async update(_actor: Actor, applicationId: string, input: Record<string, unknown>) {
        const application = applications.get(applicationId);
        if (!application) return null;
        Object.assign(application, input);
        return application;
      },
    },
    memberships: {
      async getByApplicationId(_actor: Actor, applicationId: string) {
        return [...memberships.values()].find((membership) => membership.applicationId === applicationId) ?? null;
      },
      async create(_actor: Actor, input: Record<string, unknown>) {
        const membership: Membership = {
          id: `membership-${memberships.size + 1}`,
          applicationId: input.applicationId as string,
          ownerUserId: (input.ownerUserId as string | null) ?? null,
          companyId: (input.companyId as string | null) ?? null,
          planCode: input.planCode as Application["planCode"],
          status: input.status as Membership["status"],
          seatLimit: input.seatLimit as number,
        };
        if ([...memberships.values()].some((candidate) => candidate.applicationId === membership.applicationId)) {
          throw new Error("UNIQUE_APPLICATION_MEMBERSHIP");
        }
        memberships.set(membership.id, membership);
        return membership;
      },
    },
    inspect: () => ({profiles, applications, memberships}),
  };
}

describe("join review fixes", () => {
  it("bootstraps an authenticated profile before creating an application", async () => {
    const deps = durableHarness();
    const result = await startJoin(actor, {plan: "community", applicationId: null}, deps);

    expect(deps.inspect().profiles.get(actor.userId)).toMatchObject({id: actor.userId});
    expect(deps.inspect().applications.get(result.applicationId)).toBeDefined();
  });

  it("rejects company plans without a validated company target", async () => {
    const deps = durableHarness();

    await expect(
      completeApplication(actor, {plan: "corporate", profile: {displayName: "A"}, company: null}, deps),
    ).rejects.toThrow("COMPANY_REQUIRED");
  });

  it("rejects a cross-company target and preserves the application company id", async () => {
    const deps = durableHarness();

    await expect(
      completeApplication(
        actor,
        {plan: "corporate", profile: {displayName: "A"}, company: {id: "company-b", legalName: "B", displayName: "B"}},
        deps,
      ),
    ).rejects.toThrow("FORBIDDEN");

    const accepted = await completeApplication(
      actor,
      {plan: "corporate", profile: {displayName: "A"}, company: {id: "company-a", legalName: "A", displayName: "A"}},
      deps,
    );
    const application = deps.inspect().applications.get(accepted.applicationId);
    expect(application?.companyId).toBe("company-a");
  });

  it("reuses the application membership and checkout command on resume", async () => {
    const deps = durableHarness();
    const first = await completeApplication(
      actor,
      {plan: "startup", profile: {displayName: "A"}, company: {id: "company-a", legalName: "A", displayName: "A"}},
      deps,
    );
    const second = await completeApplication(
      actor,
      {plan: "startup", applicationId: first.applicationId, profile: {displayName: "A"}, company: {id: "company-a", legalName: "A", displayName: "A"}},
      deps,
    );

    expect(deps.inspect().memberships.size).toBe(1);
    expect(second.next).toBe("checkout");
    expect(second.checkout?.membershipId).toBe(first.checkout?.membershipId);
  });
});
