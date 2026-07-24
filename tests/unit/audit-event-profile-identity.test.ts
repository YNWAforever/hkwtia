import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {auditEventsRepository} from "@/lib/db/repos/audit-events";

const actor = {kind: "member", userId: "auth-1", profileId: "member-1"} as const;
const now = new Date("2026-01-01T00:00:00.000Z");
const auditRow = ["audit-1", "member-1", "member", "updated", "profile", "member-1", null, {}, now];

describe("audit event profile identity", () => {
  beforeEach(() => { database.current = null; });

  it("writes and scopes member audit events by profileId", async () => {
    const parameters: unknown[][] = [];
    database.current = drizzle(async (_query, params) => {
      parameters.push(params);
      return {rows: [auditRow]};
    });

    await auditEventsRepository.append(actor, {action: "updated", targetType: "profile", targetId: "member-1"});
    await auditEventsRepository.listForTarget(actor, "profile", "member-1");

    expect(parameters.flat()).toContain("member-1");
    expect(parameters.flat()).not.toContain("auth-1");
  });
});
