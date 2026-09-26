import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;

describe("Member 360 first-paint summary", () => {
  it("reads identity, companies, memberships and score without any timeline query", async () => {
    const queries: string[] = [];
    database.current = drizzle(async (query) => {
      queries.push(query);
      if (/from "profiles"/i.test(query)) return {rows: [{id: "member-1", displayName: "Member", email: "m@example.test", phone: null, role: "member"}]};
      return {rows: []};
    });
    const summary = await adminMembersRepository.getSummary(staff, "member-1");
    expect(summary?.profile.displayName).toBe("Member");
    expect(summary?.engagement.events).toEqual([]);
    expect(summary?.emails).toEqual([]);
    expect(queries).toHaveLength(4);
    expect(queries.join(" ")).not.toMatch(/engagement_events|email_log|event_registrations|event_orders|member_notes|journey_state|whatsapp_log|message_suppressions/i);
  });

  it("guards the summary read before the database", async () => {
    database.current = drizzle(async () => {throw new Error("PRIVATE_READ");});
    await expect(adminMembersRepository.getSummary({kind: "member", userId: "m", profileId: "m"} as never, "member-1")).rejects.toThrow("FORBIDDEN");
  });
});
