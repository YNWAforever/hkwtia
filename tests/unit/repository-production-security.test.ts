import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";

const actor = {kind: "member", userId: "user-a"} as const;

const membershipRow = [
  "membership-a",
  null,
  "company-b",
  "application-b",
  "corporate",
  "pending_payment",
  10,
  null,
  null,
  null,
  null,
  false,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
];

const existingProfileRow = [
  "user-a",
  "Authored Display Name",
  "+852 5555 5555",
  "Founder",
  "zh-HK",
  "company",
  true,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
];

const applicationRow = (overrides: {
  applicantUserId?: string;
  companyId?: string | null;
  planCode?: "community" | "startup" | "corporate" | "patron";
} = {}) => [
  overrides.applicantUserId ?? "user-a",
  overrides.companyId === undefined ? "company-b" : overrides.companyId,
  overrides.planCode ?? "corporate",
];

function companyMembershipInput(overrides: Partial<Parameters<typeof membershipsRepository.create>[1]> = {}) {
  return {
    ownerUserId: null,
    companyId: "company-b",
    applicationId: "application-b",
    planCode: "corporate" as const,
    status: "pending_payment" as const,
    seatLimit: 10,
    ...overrides,
  };
}

describe("production repository security boundaries", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("denies a company membership when the application is outside the actor scope", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes("insert into \"memberships\"") && !normalized.includes(" select ")) {
        return {rows: [membershipRow]};
      }
      return {rows: []};
    });

    await expect(
      membershipsRepository.create(actor, companyMembershipInput()),
    ).rejects.toThrow("FORBIDDEN");

    expect(statements.join("\n")).toContain('"membership_applications"');
    expect(statements.join("\n")).toContain('"company_members"');
  });

  it("denies a company membership when the actor has no active company membership", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      if (query.toLowerCase().includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).rejects.toThrow("FORBIDDEN");

    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('"company_members"');
    expect(sql).not.toContain('insert into "memberships"');
  });

  it.each([
    {name: "plan", application: applicationRow({planCode: "startup"})},
    {name: "company", application: applicationRow({companyId: "company-a"})},
  ])("denies a company membership when the application $name does not match", async ({application}) => {
    database.current = drizzle(async (query) => {
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes('from "membership_applications"')) return {rows: [application]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).rejects.toThrow("FORBIDDEN");
  });

  it("inserts a company membership after actor, application, company, and plan checks pass", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes('from "membership_applications"')) return {rows: [applicationRow()]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).resolves.toMatchObject({
      applicationId: "application-b",
      companyId: "company-b",
      planCode: "corporate",
    });
    expect(statements.at(-1)?.toLowerCase()).toContain('insert into "memberships"');
  });

  it("requires an actor-scoped application check for a member-owned membership", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "membership_applications"')) {
        return {rows: [applicationRow({companyId: null, planCode: "community"})]};
      }
      if (normalized.includes('insert into "memberships"')) {
        return {rows: [[...membershipRow.slice(0, 1), "user-a", null, "application-b", "community", "active", 1, ...membershipRow.slice(7)]]};
      }
      return {rows: []};
    });

    await expect(
      membershipsRepository.create(actor, {
        ownerUserId: "user-a", companyId: null, applicationId: "application-b",
        planCode: "community", status: "active", seatLimit: 1,
      }),
    ).resolves.toMatchObject({ownerUserId: "user-a", companyId: null, planCode: "community"});
    expect(statements.some((query) => query.toLowerCase().includes('from "membership_applications"'))).toBe(true);
  });

  it("preserves authored profile fields when ensure finds an existing profile", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes("on conflict") && normalized.includes("do update")) {
        return {
          rows: [[
            "user-a",
            "user-a",
            null,
            null,
            "en",
            "profile",
            false,
            existingProfileRow[7],
            new Date("2026-02-01T00:00:00.000Z"),
          ]],
        };
      }
      if (normalized.startsWith("select")) return {rows: [existingProfileRow]};
      return {rows: []};
    });

    const profile = await profilesRepository.ensure(actor, {id: actor.userId, displayName: actor.userId});

    expect(profile).toMatchObject({
      displayName: "Authored Display Name",
      phone: "+852 5555 5555",
      jobTitle: "Founder",
      locale: "zh-HK",
      directoryVisible: true,
    });
    expect(statements.join("\n").toLowerCase()).toContain("on conflict");
    expect(statements.join("\n").toLowerCase()).not.toContain("do update");
  });
});
