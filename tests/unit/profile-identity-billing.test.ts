import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {membershipsRepository} from "@/lib/db/repos/memberships";

const actor = {kind: "member", userId: "auth-1", profileId: "member-1"} as const;
const membershipId = "20000000-0000-4000-8000-000000000002";
const now = new Date("2026-01-01T00:00:00.000Z");
const membershipRow = [
  membershipId, "member-1", null, "application-1", "startup", "active", "annual", 5,
  "cus_personal", "sub_personal", null, null, false, now, now,
];

describe("billing authorization profile identity", () => {
  beforeEach(() => { database.current = null; });

  it("uses profileId for personal and company billing scopes", async () => {
    const parameters: unknown[][] = [];
    database.current = drizzle(async (_query, params) => {
      parameters.push(params);
      return {rows: [membershipRow]};
    });

    await membershipsRepository.getBillingAccess(actor, membershipId);

    expect(parameters.flat()).toContain("member-1");
    expect(parameters.flat()).not.toContain("auth-1");
  });
});
