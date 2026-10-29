import {describe, expect, it, vi} from "vitest";

import type {MembershipApplication} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";
import {
  getMemberApplication,
  getMemberApplications,
  type PortalApplicationDependencies,
} from "@/lib/portal/applications";

const member: Extract<Actor, {kind: "member"}> = {
  kind: "member",
  userId: "auth-a",
  profileId: "profile-a",
};

function application(overrides: Partial<MembershipApplication> = {}): MembershipApplication {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    applicantUserId: "profile-a",
    planCode: "startup",
    companyId: null,
    currentStep: "profile",
    status: "draft",
    inviteId: null,
    createdAt: new Date("2026-10-01T01:00:00Z"),
    updatedAt: new Date("2026-10-02T02:30:00Z"),
    ...overrides,
  };
}

function dependencies(rows: readonly MembershipApplication[]): PortalApplicationDependencies & {
  applications: {listOwned: ReturnType<typeof vi.fn>};
} {
  return {
    applications: {listOwned: vi.fn(async () => rows), listOwnedPage: vi.fn(async () => ({items: rows, nextCursor: null})), getOwnedById: vi.fn(async (_actor: Actor, id: string) => rows.find(row => row.id === id) ?? null)},
  };
}

describe("member-owned application projection", () => {
  it.each([
    {
      label: "draft at profile",
      row: application(),
      missing: ["profile"],
      nextAction: "resume",
    },
    {
      label: "draft at company without a company row",
      row: application({currentStep: "company"}),
      missing: ["company"],
      nextAction: "resume",
    },
    {
      label: "draft at company with a saved company",
      row: application({currentStep: "company", companyId: "22222222-2222-4222-8222-222222222222"}),
      missing: [],
      nextAction: "resume",
    },
    {
      label: "awaiting payment",
      row: application({currentStep: "checkout", status: "pending_payment"}),
      missing: [],
      nextAction: "billing",
    },
    {
      label: "under review",
      row: application({currentStep: "review", status: "pending_review"}),
      missing: [],
      nextAction: "wait",
    },
    {
      label: "complete",
      row: application({currentStep: "complete", status: "completed"}),
      missing: [],
      nextAction: "complete",
    },
    {
      label: "closed",
      row: application({status: "abandoned"}),
      missing: [],
      nextAction: "new",
    },
  ] as const)("$label exposes only explicit status-derived guidance", async ({row, missing, nextAction}) => {
    const [view] = await getMemberApplications(member, dependencies([row]));
    expect(view).toMatchObject({
      id: row.id,
      status: row.status,
      step: row.currentStep,
      missing,
      nextAction,
    });
  });

  it("filters foreign applicant rows even when a reader returns them by mistake", async () => {
    const own = application();
    const foreign = application({id: "22222222-2222-4222-8222-222222222222", applicantUserId: "profile-b"});
    await expect(getMemberApplications(member, dependencies([own, foreign]))).resolves.toMatchObject([
      {id: own.id, planCode: "startup"},
    ]);
  });

  it("does not copy staff notes, task context or audit data into the member projection", async () => {
    const hostile = {
      ...application(),
      internalNote: "STAFF_NOTE",
      staffTask: {context: {missingFields: ["stripeCustomerId"]}},
      auditEvents: [{actorName: "Synthetic Staff"}],
    } as MembershipApplication;
    const [view] = await getMemberApplications(member, dependencies([hostile]));
    expect(JSON.stringify(view)).not.toMatch(/STAFF_NOTE|Synthetic Staff|stripeCustomerId|auditEvents/);
  });

  it("detail reads use the owned ID reader without listing history", async () => {
    const row = application(); const deps = dependencies([row]);
    expect(await getMemberApplication(member, row.id, deps)).toMatchObject({id: row.id});
    expect(deps.applications.listOwned).not.toHaveBeenCalled();
  });

  it("returns the same owned projection from the detail read", async () => {
    const row = application({currentStep: "company"});
    const deps = dependencies([row]);
    const [listView] = await getMemberApplications(member, deps);
    await expect(getMemberApplication(member, row.id, deps)).resolves.toEqual(listView);
  });

  it("treats invalid and foreign detail IDs as not found without exposing another record", async () => {
    const own = application();
    const foreign = application({id: "22222222-2222-4222-8222-222222222222", applicantUserId: "profile-b"});
    const deps = dependencies([own, foreign]);
    await expect(getMemberApplication(member, "not-a-uuid", deps)).resolves.toBeNull();
    await expect(getMemberApplication(member, foreign.id, deps)).resolves.toBeNull();
  });

  it("denies anonymous and staff actors before reading application rows", async () => {
    const deps = dependencies([application()]);
    await expect(getMemberApplications({kind: "anonymous", userId: null}, deps)).rejects.toThrow("FORBIDDEN");
    await expect(getMemberApplications({kind: "staff", userId: "auth-staff", profileId: "profile-staff"}, deps)).rejects.toThrow("FORBIDDEN");
    expect(deps.applications.listOwned).not.toHaveBeenCalled();
  });

  it("propagates read failure so the page can show a retry state rather than a false empty list", async () => {
    const deps = dependencies([]);
    deps.applications.listOwned.mockRejectedValueOnce(new Error("DB_UNAVAILABLE"));
    await expect(getMemberApplications(member, deps)).rejects.toThrow("DB_UNAVAILABLE");
  });
});
