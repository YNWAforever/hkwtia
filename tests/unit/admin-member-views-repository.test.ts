import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});
import {adminMemberViewsRepository} from "@/lib/db/repos/admin-member-views";

const staff = {kind: "staff", userId: "staff-a", profileId: "staff-a"} as const;

describe("member saved view repository", () => {
  it("lists only own or published shared views and validates stored filters", async () => {
    const statements: {sql: string; params: unknown[]}[] = [];
    database.current = drizzle(async (query, params) => {
      statements.push({sql: query, params});
      return {rows: [{id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ownerProfileId: "staff-a", name: "Active", query: {status: ["active"]}, filterVersion: 1, shared: false, updatedAt: new Date("2026-09-27T00:00:00Z")}]};
    });
    const views = await adminMemberViewsRepository.list(staff);
    expect(views[0]).toMatchObject({name: "Active", query: {status: ["active"]}});
    expect(statements[0].sql).toMatch(/owner_profile_id.*shared/i);
    expect(statements[0].params).toContain("staff-a");
  });

  it("rejects a member before reading saved filters", async () => {
    database.current = drizzle(async () => {throw new Error("PRIVATE_READ");});
    await expect(adminMemberViewsRepository.list({kind: "member", userId: "m", profileId: "m"} as never)).rejects.toThrow("FORBIDDEN");
  });
});
