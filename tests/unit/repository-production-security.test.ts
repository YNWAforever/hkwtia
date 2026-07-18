import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {companiesRepository} from "@/lib/db/repos/companies";
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
  "annual",
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
  "user-a",
  null,
  "member",
  null,
  false,
  [],
  "Authored Display Name",
  "+852 5555 5555",
  "Founder",
  "zh-HK",
  "company",
  true,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
];

const companyRow = [
  "company-b",
  "Acme Limited",
  "Acme",
  null,
  null,
  null,
  null,
  null,
  false,
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

  it.each([
    {
      name: "personal",
      input: {
        ownerUserId: "user-a",
        companyId: null,
        applicationId: null,
        planCode: "community",
        status: "active",
        seatLimit: 1,
      } satisfies Parameters<typeof membershipsRepository.create>[1],
    },
    {
      name: "company",
      input: companyMembershipInput({applicationId: null}),
    },
  ])("denies a member-created $name membership without an application", async ({input}) => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"')) return {rows: [["company-b"]]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, input)).rejects.toThrow("FORBIDDEN");

    expect(statements.join("\n").toLowerCase()).not.toContain('insert into "memberships"');
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

  it("creates a company and initial active owner only by claiming the actor's application", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [{id: "company-a", legalName: "Acme Limited", displayName: "Acme"}]};
    });

    await expect(companiesRepository.createForApplication(actor, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    }, {companyId: () => "company-a", memberId: () => "member-a"})).resolves.toMatchObject({id: "company-a"});

    expect(statements).toHaveLength(1);
    const sql = statements[0].toLowerCase();
    expect(sql.indexOf('update "membership_applications"')).toBeLessThan(sql.indexOf('insert into "companies"'));
    expect(sql).toContain('applicant_user_id');
    expect(sql).toContain('insert into "company_members"');
    expect(sql).toContain("owner");
  });

  it("rejects anonymous company creation before issuing SQL", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: []};
    });

    await expect(companiesRepository.createForApplication({kind: "anonymous", userId: null}, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    })).rejects.toThrow("FORBIDDEN");
    expect(statements).toEqual([]);
  });

  it("keeps company and owner creation in one rollback-safe statement", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      throw new Error("owner insert failed");
    });

    await expect(companiesRepository.createForApplication(actor, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    })).rejects.toThrow("Failed query");
    expect(statements).toHaveLength(1);
  });

  it("allows only one concurrent claim of the same application", async () => {
    let calls = 0;
    database.current = drizzle(async () => {
      calls += 1;
      return calls === 1
        ? {rows: [{id: "company-a", legalName: "Acme Limited", displayName: "Acme"}]}
        : {rows: []};
    });

    const results = await Promise.allSettled([
      companiesRepository.createForApplication(actor, "application-a", {legalName: "Acme Limited", displayName: "Acme"}),
      companiesRepository.createForApplication(actor, "application-a", {legalName: "Other Limited", displayName: "Other"}),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(Promise.reject((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason)).rejects.toThrow("APPLICATION_COMPANY_CONFLICT");
  });

  it("denies an ordinary active company member from updating company data", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: []};
    });

    await expect(companiesRepository.update(actor, "company-b", {displayName: "Attacker Rename"})).rejects.toThrow("FORBIDDEN");

    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('from "company_members"');
    expect(sql).toContain('"role"');
    expect(sql).toContain('"revoked_at"');
    expect(parameters.flat()).toEqual(expect.arrayContaining(["owner", "admin"]));
  });

  it.each(["owner", "admin"] as const)("allows an active %s to update company data", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: [companyRow]};
    });

    await expect(companiesRepository.update(actor, "company-b", {displayName: "Acme Updated"})).resolves.toMatchObject({
      id: "company-b",
      displayName: "Acme",
    });
    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('from "company_members"');
    expect(sql).toContain('"role"');
    expect(parameters.flat()).toEqual(expect.arrayContaining(["owner", "admin"]));
  });

  it("preserves system company updates without member-role scoping", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [companyRow]};
    });

    await expect(companiesRepository.update({kind: "system", userId: null, source: "stripe-webhook"}, "company-b", {
      displayName: "Acme Updated",
    })).resolves.toMatchObject({id: "company-b"});
    expect(statements.join("\n").toLowerCase()).not.toContain('from "company_members"');
  });
});
