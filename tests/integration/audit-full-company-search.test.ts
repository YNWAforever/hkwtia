// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const state = vi.hoisted(() => ({ db: null as unknown, reads: 0 }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => {
    state.reads++;
    return state.db;
  },
}));
import { searchAdminCompanies } from "@/lib/db/repos/companies";
const actor = {
  kind: "staff",
  profileId: "t18-staff",
  userId: "t18-auth",
} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "private company name autocomplete",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      state.db = f.database;
      await f.pool.query(
        "INSERT INTO companies(id,legal_name,display_name,directory_visible) VALUES('18000000-0000-4000-8000-000000000041','Synthetic private legal','Synthetic private company',false)",
      );
    }, 120000);
    afterAll(async () => {
      if (f) await f.close();
    });
    it("finds a private company by name for an authenticated staff actor", async () => {
      expect(await searchAdminCompanies(actor, { search: "private" })).toEqual([
        {
          id: "18000000-0000-4000-8000-000000000041",
          name: "Synthetic private company",
        },
      ]);
    });
    it("rejects members and unknown/hostile filters before a read", async () => {
      const before = state.reads;
      await expect(
        searchAdminCompanies(
          { kind: "member", profileId: "x", userId: "x" },
          { search: "private" },
        ),
      ).rejects.toThrow("FORBIDDEN");
      for (const input of [
        { search: "x".repeat(121) },
        { search: "private", actor: "forged" },
        { search: "private", selectedId: "invalid" },
      ])
        await expect(searchAdminCompanies(actor, input)).rejects.toThrow();
      expect(state.reads).toBe(before);
    });
  },
);
