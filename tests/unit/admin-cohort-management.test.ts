import {describe, expect, it} from "vitest";

import {cohortFormInput} from "@/lib/admin/cohort-form-input";
import {createCohortRepository, type CohortInput, type CohortStore} from "@/lib/db/repos/cohorts";
import type {Cohort} from "@/lib/db/server-schema";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const cohortId = "60000062-0000-4000-8000-0000000000a1";

function cohort(overrides: Partial<Cohort> = {}): Cohort {
  return {
    id: cohortId,
    slug: "launch-pad-2026",
    nameEn: "Launch Pad 2026",
    nameZhHk: "啟航計劃 2026",
    descriptionEn: "A cohort.",
    descriptionZhHk: "一個期數。",
    track: "growth",
    startsOn: "2026-09-01",
    endsOn: null,
    capacity: 24,
    feeHkd: 0,
    status: "planning",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    slug: "launch-pad-2027",
    nameEn: "Launch Pad 2027",
    nameZhHk: "啟航計劃 2027",
    descriptionEn: "Next cohort.",
    descriptionZhHk: "下一期。",
    track: "growth",
    startsOn: "2027-01-01",
    endsOn: "2027-06-30",
    capacity: "20",
    feeHkd: "1000",
    status: "planning",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function store(initial: Cohort[] = []) {
  const rows = [...initial];
  const audits: {action: string; actorProfileId: string}[] = [];
  const base = {
    listPublicCohorts: async () => [],
    findActiveCompanyId: async () => null,
    getApplication: async () => null,
    createApplication: async () => { throw new Error("unused"); },
    listForAdmin: async () => [],
    moveApplication: async () => null,
  } as unknown as CohortStore;
  return {
    ...base,
    listCohorts: async () => rows,
    getCohort: async (id: string) => rows.find((row) => row.id === id) ?? null,
    findCohortBySlug: async (slug: string) => rows.find((row) => row.slug === slug) ?? null,
    insertCohort: async (input: CohortInput, actor: AdminActor) => {
      const created = cohort({...input, id: "60000062-0000-4000-8000-0000000000b2"});
      rows.push(created);
      audits.push({action: "cohort.created", actorProfileId: actor.profileId});
      return created;
    },
    updateCohort: async (id: string, input: CohortInput, actor: AdminActor) => {
      const current = rows.find((row) => row.id === id);
      if (!current) return null;
      const updated = cohort({...current, ...input});
      rows[rows.indexOf(current)] = updated;
      audits.push({action: "cohort.updated", actorProfileId: actor.profileId});
      return updated;
    },
    get rows() { return rows; },
    get audits() { return audits; },
  };
}

function repository(seed: Cohort[] = []) {
  const backing = store(seed);
  return {repo: createCohortRepository({store: backing}), backing};
}

describe("cohort management", () => {
  it("creates a cohort and records who created it", async () => {
    const {repo, backing} = repository();

    const created = await repo.createCohort(staff, cohortFormInput(form()));

    expect(created.slug).toBe("launch-pad-2027");
    expect(backing.audits).toEqual([{action: "cohort.created", actorProfileId: "profile-staff"}]);
  });

  it("refuses a non-admin actor before touching the store", async () => {
    const {repo, backing} = repository();

    await expect(repo.createCohort(member as never, cohortFormInput(form()))).rejects.toThrow();
    expect(backing.rows).toEqual([]);
    expect(backing.audits).toEqual([]);
  });

  it("rejects a slug already in use", async () => {
    const {repo} = repository([cohort({slug: "launch-pad-2027"})]);

    await expect(repo.createCohort(staff, cohortFormInput(form())))
      .rejects.toThrow(/COHORT_SLUG_TAKEN/);
  });

  it("lets a cohort keep its own slug on edit", async () => {
    const {repo} = repository([cohort({slug: "launch-pad-2027"})]);

    const updated = await repo.updateCohort(staff, cohortId, cohortFormInput(form()));

    expect(updated?.slug).toBe("launch-pad-2027");
  });

  it("rejects an end date before the start date", async () => {
    const {repo} = repository();

    await expect(repo.createCohort(staff, cohortFormInput(form({startsOn: "2027-06-30", endsOn: "2027-01-01"}))))
      .rejects.toThrow(/COHORT_END_BEFORE_START/);
  });

  // An untouched <input type="date"> submits "", which is not the same as an
  // absent end date and must not reach a `date` column.
  it("treats an empty end date as no fixed end date", async () => {
    const {repo} = repository();

    const created = await repo.createCohort(staff, cohortFormInput(form({endsOn: ""})));

    expect(created.endsOn).toBeNull();
  });

  it.each([
    ["capacity", "0"],
    ["capacity", "-1"],
    ["capacity", "not-a-number"],
    ["feeHkd", "-1"],
    ["slug", "Not A Slug"],
    ["status", "published"],
  ])("rejects an invalid %s of %s", async (field, value) => {
    const {repo} = repository();

    await expect(repo.createCohort(staff, cohortFormInput(form({[field]: value})))).rejects.toThrow();
  });

  it("returns null for a malformed id instead of throwing", async () => {
    const {repo} = repository([cohort()]);

    await expect(repo.getCohortForAdmin(staff, "not-a-uuid")).resolves.toBeNull();
  });

  it("records an update with the actor who made it", async () => {
    const {repo, backing} = repository([cohort()]);

    await repo.updateCohort(staff, cohortId, cohortFormInput(form({slug: "launch-pad-2026", status: "open"})));

    expect(backing.audits).toEqual([{action: "cohort.updated", actorProfileId: "profile-staff"}]);
    expect(backing.rows[0]?.status).toBe("open");
  });
});
