import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {applicationsRepository} from "@/lib/db/repos/applications";
import {companiesRepository} from "@/lib/db/repos/companies";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";

const actor = {kind: "member", userId: "auth-1", profileId: "member-1"} as const;
const profileRow = [
  "member-1", "auth-1", null, "member", null, false, [], "Member", null, null,
  "en", "profile", false, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"),
];

describe("production repositories use application profile identity", () => {
  beforeEach(() => { database.current = null; });

  it("uses profileId for profile, application, company, and membership ownership", async () => {
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      parameters.push(params);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "profiles"')) return {rows: [profileRow]};
      if (normalized.includes('update "membership_applications"')) {
        return {rows: [{id: "company-1", legalName: "Company", displayName: "Company"}]};
      }
      return {rows: []};
    });

    await profilesRepository.getById(actor, "member-1");
    await applicationsRepository.create(actor, {planCode: "community", currentStep: "profile", status: "draft"});
    await companiesRepository.createForApplication(actor, "application-1", {
      legalName: "Company", displayName: "Company",
    }, {companyId: () => "company-1", memberId: () => "company-member-1"});
    await membershipsRepository.list(actor);

    const values = parameters.flat();
    expect(values).toContain("member-1");
    expect(values).not.toContain("auth-1");
  });

  it("uses auth userId only for the profile auth mapping", async () => {
    const parameters: unknown[][] = [];
    database.current = drizzle(async (_query, params) => {
      parameters.push(params);
      return {rows: [profileRow]};
    });

    await profilesRepository.ensure(actor, {id: "member-1", displayName: "Member"});

    const values = parameters.flat();
    expect(values).toContain("member-1");
    expect(values).toContain("auth-1");
  });
});
