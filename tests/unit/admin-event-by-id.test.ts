import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => state.database};
});

import {eventsRepository} from "@/lib/db/repos/events";

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staff = {kind: "staff", userId: "staff-a", profileId: "staff-a"} as const;

describe("admin event detail read", () => {
  it("queries only the requested event ID instead of sorting all events", async () => {
    const statements: string[] = [];
    state.database = drizzle(async (query) => {statements.push(query); return {rows: []};});
    expect(await eventsRepository.getForAdmin(staff, eventId)).toBeNull();
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/where .*events.*id.*=\s*\$1/i);
    expect(statements[0]).toMatch(/limit\s+\$2/i);
    expect(statements[0]).not.toMatch(/order by/i);
  });

  it("rejects a member before reading the private event", async () => {
    state.database = drizzle(async () => {throw new Error("PRIVATE_READ");});
    await expect(eventsRepository.getForAdmin({kind: "member", userId: "member", profileId: "member"}, eventId)).rejects.toThrow("FORBIDDEN");
  });
});
