import {describe, expect, it} from "vitest";

import type {Cohort, CohortApplication, LandingPartner} from "@/lib/db/server-schema";
import {
  createCohortRepository,
  type CohortStore,
} from "@/lib/db/repos/cohorts";
import {actorFor, anonymousActor} from "@/tests/helpers/fakes";

const cohortId = "60000060-0000-4000-8000-000000000001";
const companyId = "60000061-0000-4000-8000-000000000001";

function cohort(overrides: Partial<Cohort> = {}): Cohort {
  return {
    id: cohortId,
    slug: "launch-pad-2026",
    nameEn: "Launch Pad 2026",
    nameZhHk: "Launch Pad 2026",
    descriptionEn: "A cohort for testing.",
    descriptionZhHk: "測試 cohort。",
    track: "growth",
    startsOn: "2026-09-01",
    endsOn: null,
    capacity: 24,
    feeHkd: 0,
    status: "open",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function application(overrides: Partial<CohortApplication> = {}): CohortApplication {
  return {
    id: "60000062-0000-4000-8000-000000000001",
    cohortId,
    companyId,
    stage: "applied",
    readiness: {market: "Singapore"},
    notes: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function memoryStore(initial: CohortApplication[] = []): CohortStore & {
  readonly auditEvents: readonly {action: string; applicationId: string}[];
  readonly goneGlobalCompanyIds: readonly string[];
} {
  const applications = [...initial];
  const auditEvents: {action: string; applicationId: string}[] = [];
  const goneGlobalCompanyIds: string[] = [];
  const partners: LandingPartner[] = [];
  return {
    listPublicCohorts: async () => [cohort()],
    listPublicPartners: async () => partners,
    findActiveCompanyId: async () => companyId,
    getApplication: async (requestedCohortId, requestedCompanyId) => applications.find((row) => row.cohortId === requestedCohortId && row.companyId === requestedCompanyId) ?? null,
    getCohort: async (id) => id === cohortId ? cohort() : null,
    createApplication: async (input) => {
      const existing = applications.find((row) => row.cohortId === input.cohortId && row.companyId === input.companyId);
      if (existing) return existing;
      const created = application({id: "60000062-0000-4000-8000-000000000002", ...input});
      applications.push(created);
      return created;
    },
    listForAdmin: async () => applications,
    moveApplication: async (input) => {
      const current = applications.find((row) => row.id === input.applicationId);
      if (!current) return null;
      const updated = application({...current, stage: input.nextStage, notes: input.notes ?? current.notes});
      applications[applications.indexOf(current)] = updated;
      auditEvents.push({action: "cohort_application.stage_changed", applicationId: updated.id});
      if (input.nextStage === "graduated" && !goneGlobalCompanyIds.includes(updated.companyId)) {
        goneGlobalCompanyIds.push(updated.companyId);
      }
      return updated;
    },
    get auditEvents() { return auditEvents; },
    get goneGlobalCompanyIds() { return goneGlobalCompanyIds; },
  };
}

describe("M6 cohort repository", () => {
  it("requires an authenticated member before creating an application", async () => {
    const repo = createCohortRepository({store: memoryStore()});
    await expect(repo.createApplication(anonymousActor(), cohortId, {cohortId, readiness: {market: "Singapore"}}))
      .rejects.toThrow("FORBIDDEN");
  });

  it("creates one application per active company even when submitted twice", async () => {
    const store = memoryStore();
    const repo = createCohortRepository({store, getCompanyRole: async () => "owner"});
    const member = actorFor("member-1");
    const first = await repo.createApplication(member, cohortId, {cohortId, readiness: {market: "Singapore"}});
    const second = await repo.createApplication(member, cohortId, {cohortId, readiness: {market: "Singapore"}});
    expect(second.id).toBe(first.id);
    expect((await repo.listForAdmin({kind: "staff", userId: "staff-1", profileId: "staff-1"})).filter((row) => row.cohortId === cohortId && row.companyId === companyId)).toHaveLength(1);
  });

  it("rejects a company member role before creating an application", async () => {
    const repo = createCohortRepository({store: memoryStore(), getCompanyRole: async () => "member"});
    await expect(repo.createApplication(actorFor("member-1"), cohortId, {cohortId, readiness: {market: "Singapore"}}))
      .rejects.toThrow("FORBIDDEN");
  });

  it("requires staff access to list and move applications", async () => {
    const repo = createCohortRepository({store: memoryStore([application()])});
    await expect(repo.listForAdmin(actorFor("member-1") as never)).rejects.toThrow("FORBIDDEN");
    await expect(repo.moveApplication(actorFor("member-1") as never, application().id, "accepted"))
      .rejects.toThrow("FORBIDDEN");
  });

  it("rejects an invalid stage transition before an audit write", async () => {
    const store = memoryStore([application({stage: "applied"})]);
    const repo = createCohortRepository({store});
    const staff = {kind: "staff", userId: "staff-1", profileId: "staff-1"} as const;
    await expect(repo.moveApplication(staff, application().id, "scale")).rejects.toThrow("INVALID_COHORT_STAGE_TRANSITION");
    expect(store.auditEvents).toHaveLength(0);
  });

  it("writes one audit event and flags the Showcase listing on graduation", async () => {
    const store = memoryStore([application({stage: "scale"})]);
    const repo = createCohortRepository({store});
    const staff = {kind: "staff", userId: "staff-1", profileId: "staff-1"} as const;
    const updated = await repo.moveApplication(staff, application().id, "graduated", "Completed landing");
    expect(updated?.stage).toBe("graduated");
    expect(store.auditEvents).toEqual([{action: "cohort_application.stage_changed", applicationId: application().id}]);
    expect(store.goneGlobalCompanyIds).toEqual([companyId]);
    await expect(repo.moveApplication(staff, application().id, "scale")).rejects.toThrow("INVALID_COHORT_STAGE_TRANSITION");
  });
});
