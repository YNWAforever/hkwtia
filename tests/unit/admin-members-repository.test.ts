import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {adminMemberQuerySchema} from "@/lib/admin/member-query";

const actor = {kind: "staff", userId: "staff-1", profileId: "staff-1"} as const;
const alpha = {profileId: "profile-alpha", displayName: "Alpha", email: "alpha@example.test", companyName: "Acme One", planCode: "corporate", membershipStatus: "active", renewalAt: new Date("2027-01-01T00:00:00.000Z"), score: "10"};
const beta = {profileId: "profile-beta", displayName: "Beta", email: "beta@example.test", companyName: "Acme Two", planCode: "startup", membershipStatus: "past_due", renewalAt: null, score: "5"};
const charlie = {profileId: "profile-charlie", displayName: "Charlie", email: "charlie@example.test", companyName: null, planCode: null, membershipStatus: null, renewalAt: null, score: null};

describe("admin members repository SQL projection", () => {
  beforeEach(() => { database.current = null; });

  it("matches filters on one membership row and returns every matching membership ID", async () => {
    const queries: {sql: string; params: unknown[]}[] = [];
    database.current = drizzle(async (query, params) => {
      queries.push({sql: query, params});
      return {rows: [{...alpha, membershipId: "membership-a", companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", matchingMembershipIds: ["membership-a", "membership-b"], sortKey: "alpha", totalMatching: 1}]};
    });
    const query = adminMemberQuerySchema.parse({status: ["active"], planCode: ["corporate"], companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", renewalFrom: "2026-10-01", renewalTo: "2026-10-31"});
    const page = await adminMembersRepository.search(actor, query);
    expect(page.items[0].matchingMembershipIds).toEqual(["membership-a", "membership-b"]);
    expect(page.totalMatching).toBe(1);
    expect(queries[0].sql).toMatch(/array_agg\(distinct.*membership_id/i);
    expect(queries[0].sql).toMatch(/matching_memberships/i);
    expect(queries[0].params.some((value) => value instanceof Date && value.toISOString() === "2026-09-30T16:00:00.000Z")).toBe(true);
    expect(queries[0].params.some((value) => value instanceof Date && value.toISOString() === "2026-10-31T16:00:00.000Z")).toBe(true);
  });

  it("uses a finite null-renewal sort key that survives a paginated cursor", async () => {
    const queries: string[] = [];
    database.current = drizzle(async (query) => {
      queries.push(query);
      return {rows: [{...beta, membershipId: "membership-b", companyId: null, matchingMembershipIds: ["membership-b"], sortKey: new Date("9999-12-31T00:00:00.000Z"), totalMatching: 2}, {...charlie, matchingMembershipIds: [], sortKey: new Date("9999-12-31T00:00:00.000Z"), totalMatching: 2}]};
    });
    const page = await adminMembersRepository.search(actor, {sort: "renewal_asc", limit: 1});
    expect(page.nextCursor).toBeTruthy();
    expect(queries[0]).toContain("9999-12-31");
    expect(queries[0]).not.toContain("'infinity'");
    await expect(adminMembersRepository.search(actor, {sort: "renewal_asc", limit: 1, cursor: page.nextCursor})).resolves.toBeTruthy();
  });

  it("projects one deterministic row per profile before cursor pagination while retaining any-company search", async () => {
    const queries: string[] = [];
    database.current = drizzle(async (query, params) => {
      queries.push(query);
      const usesProjection = /row_number\(\) over \(partition by/i.test(query);
      const afterBeta = params.includes("beta") && params.includes("profile-beta");
      if (!usesProjection) return {rows: [alpha, {...alpha, companyName: "Acme Two", planCode: "startup"}, beta, charlie]};
      return {rows: afterBeta ? [charlie] : [alpha, beta, charlie]};
    });

    const first = await adminMembersRepository.search(actor, {search: "acme", limit: 2, cursor: null});
    const second = await adminMembersRepository.search(actor, {search: "acme", limit: 2, cursor: first.nextCursor});

    expect(first.items.map((item) => item.profileId)).toEqual(["profile-alpha", "profile-beta"]);
    expect(second.items.map((item) => item.profileId)).toEqual(["profile-charlie"]);
    expect(new Set([...first.items, ...second.items].map((item) => item.profileId)).size).toBe(3);
    expect(queries.join("\n")).toMatch(/row_number\(\) over \(partition by/i);
    expect(queries.join("\n")).toMatch(/position\(/i);
  });
});
