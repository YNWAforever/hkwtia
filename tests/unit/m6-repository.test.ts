import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import type {Cohort, CohortApplication} from "@/lib/db/server-schema";
import {
  createCohortRepository,
  databaseStore,
  PUBLIC_COHORT_STATUSES,
  type AdminCohortApplication,
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

function adminApplication(row: CohortApplication): AdminCohortApplication {
  return {
    id: row.id,
    cohortId: row.cohortId,
    companyId: row.companyId,
    stage: row.stage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    companyDisplayName: "Harbour Systems",
    cohortSlug: "launch-pad-2026",
    cohortNameEn: "Launch Pad 2026",
    cohortNameZhHk: "啟航計劃 2026",
  };
}

function memoryStore(initial: CohortApplication[] = [], options: Readonly<{closeBeforeCreate?: boolean}> = {}): CohortStore & {
  readonly auditEvents: readonly {action: string; applicationId: string}[];
  readonly goneGlobalCompanyIds: readonly string[];
} {
  const applications = [...initial];
  const auditEvents: {action: string; applicationId: string}[] = [];
  const goneGlobalCompanyIds: string[] = [];
  return {
    listPublicCohorts: async (actor) => {
      void actor;
      return [cohort()];
    },
    findActiveCompanyId: async () => companyId,
    getApplication: async (requestedCohortId, requestedCompanyId) => applications.find((row) => row.cohortId === requestedCohortId && row.companyId === requestedCompanyId) ?? null,
    getCohort: async (id) => id === cohortId ? cohort() : null,
    createApplication: async (input) => {
      if (options.closeBeforeCreate) throw new Error("COHORT_NOT_OPEN");
      const existing = applications.find((row) => row.cohortId === input.cohortId && row.companyId === input.companyId);
      if (existing) return existing;
      const created = application({id: "60000062-0000-4000-8000-000000000002", ...input});
      applications.push(created);
      return created;
    },
    listForAdmin: async () => applications.map(adminApplication),
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
  it("publicly projects only open and active cohorts", () => {
    expect(PUBLIC_COHORT_STATUSES).toEqual(["open", "active"]);
    expect(["planning", "open", "active", "completed", "archived"].filter((status) =>
      (PUBLIC_COHORT_STATUSES as readonly string[]).includes(status),
    )).toEqual(["open", "active"]);

    const source = readFileSync("lib/db/repos/cohorts.ts", "utf8");
    expect(source).toContain("inArray(cohorts.status, PUBLIC_COHORT_STATUSES)");
    expect(source).not.toContain('ne(cohorts.status, "archived")');
  });

  it("applies the explicit public status predicate to database rows", async () => {
    const rows = ["planning", "open", "active", "completed", "archived"].map((status) => {
      const row = cohort({status: status as Cohort["status"]});
      return {
        id: row.id, slug: row.slug, nameEn: row.nameEn, nameZhHk: row.nameZhHk,
        descriptionEn: row.descriptionEn, descriptionZhHk: row.descriptionZhHk,
        track: row.track, startsOn: row.startsOn, endsOn: row.endsOn,
        capacity: row.capacity, feeHkd: row.feeHkd, status: row.status,
      };
    });
    let whereCondition: {queryChunks?: readonly unknown[]} | undefined;
    const database = {
      select: () => ({
        from: () => ({
          where: (condition: {queryChunks?: readonly unknown[]}) => {
            whereCondition = condition;
            return {orderBy: async () => rows.filter((row) => (PUBLIC_COHORT_STATUSES as readonly string[]).includes(row.status))};
          },
        }),
      }),
    };
    const store = databaseStore(async () => database as never);

    await expect(store.listPublicCohorts(anonymousActor())).resolves.toHaveLength(2);
    const predicateValues = (whereCondition?.queryChunks ?? [])
      .filter((chunk): chunk is readonly unknown[] => Array.isArray(chunk))
      .flat();
    expect(predicateValues).toHaveLength(2);
    expect((predicateValues[0] as {value?: unknown}).value).toBe("open");
    expect((predicateValues[1] as {value?: unknown}).value).toBe("active");
  });

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

  it("rejects a cohort that closes after the initial read but before the write", async () => {
    const repo = createCohortRepository({
      store: memoryStore([], {closeBeforeCreate: true}),
      getCompanyRole: async () => "owner",
    });
    await expect(repo.createApplication(actorFor("member-1"), cohortId, {cohortId, readiness: {market: "Singapore"}}))
      .rejects.toThrow("COHORT_NOT_OPEN");
  });

  it("requires staff access to list and move applications", async () => {
    const repo = createCohortRepository({store: memoryStore([application()])});
    await expect(repo.listForAdmin(actorFor("member-1") as never)).rejects.toThrow("FORBIDDEN");
    await expect(repo.moveApplication(actorFor("member-1") as never, application().id, "accepted"))
      .rejects.toThrow("FORBIDDEN");
  });

  it("returns staff-safe cohort and company display projections without readiness or notes", async () => {
    const repo = createCohortRepository({store: memoryStore([application()])});
    const rows = await repo.listForAdmin({kind: "staff", userId: "staff-1", profileId: "staff-1"});

    expect(rows).toEqual([expect.objectContaining({
      id: application().id,
      companyDisplayName: "Harbour Systems",
      cohortSlug: "launch-pad-2026",
      cohortNameEn: "Launch Pad 2026",
      cohortNameZhHk: "啟航計劃 2026",
    })]);
    expect(rows[0]).not.toHaveProperty("readiness");
    expect(rows[0]).not.toHaveProperty("notes");
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
