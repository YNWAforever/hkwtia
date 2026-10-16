import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => state.database};
});
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const dialect = new PgDialect();
const notes = [
  {id: "11111111-1111-4111-8111-111111111111", authorProfileId: "staff", authorName: "Staff", body: "First", replacesNoteId: null, createdAt: new Date("2026-09-27T01:00:00Z"), cursor_at: new Date("2026-09-27T01:00:00Z"), cursor_id: "11111111-1111-4111-8111-111111111111"},
  {id: "22222222-2222-4222-8222-222222222222", authorProfileId: "staff", authorName: "Staff", body: "Second", replacesNoteId: null, createdAt: new Date("2026-09-27T01:00:00Z"), cursor_at: new Date("2026-09-27T01:00:00Z"), cursor_id: "22222222-2222-4222-8222-222222222222"},
  {id: "33333333-3333-4333-8333-333333333333", authorProfileId: "staff", authorName: "Staff", body: "Third", replacesNoteId: null, createdAt: new Date("2026-09-26T01:00:00Z"), cursor_at: new Date("2026-09-26T01:00:00Z"), cursor_id: "33333333-3333-4333-8333-333333333333"},
];
function fakeDatabase() {
  const statements: {sql: string; params: readonly unknown[]}[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const rendered = dialect.sqlToQuery(query as never);
    statements.push({sql: rendered.sql, params: rendered.params as readonly unknown[]});
    if (/from "profiles"/i.test(rendered.sql)) return {rows: [{id: "member-1", displayName: "Member", email: "m@example.test", phone: null, role: "member"}]};
    if (/from "member_notes"/i.test(rendered.sql)) return {rows: notes};
    return {rows: []};
  });
  return {database: {execute}, statements};
}

describe("staff Member 360 timeline pages", () => {
  it("loads one history, bounds SQL and keeps same-time ID ties", async () => {
    const fake = fakeDatabase(); state.database = fake.database;
    const result = await adminMembersRepository.getMemberTimelinePage(staff, "member-1", "notes", {limit: 2, search: "", cursor: null});
    expect(result?.kind).toBe("notes");
    expect(result?.page.items.map((item) => item.id)).toEqual(notes.slice(0, 2).map((item) => item.id));
    expect(result?.page.nextCursor).toBeTruthy();
    expect(fake.statements).toHaveLength(2);
    expect(fake.statements[1].sql).toMatch(/order by .*created_at" desc.*id" desc/is);
    expect(fake.statements[1].params).toContain(3);
    await adminMembersRepository.getMemberTimelinePage(staff, "member-1", "notes", {limit: 2, search: "", cursor: result!.page.nextCursor});
    expect(fake.statements[3].sql).toMatch(/\(.*created_at", .*id"::text\)\s*</is);
    expect(fake.statements[3].params).toContain(notes[1].id);
  });

  it("refuses unbounded limits, other-section cursors and non-admin actors before a read", async () => {
    const fake = fakeDatabase(); state.database = fake.database;
    await expect(adminMembersRepository.getMemberTimelinePage(staff, "member-1", "notes", {limit: Infinity, search: "", cursor: null})).rejects.toThrow();
    await expect(adminMembersRepository.getMemberTimelinePage({kind: "member", userId: "m", profileId: "m"} as never, "member-1", "notes", {})).rejects.toThrow("FORBIDDEN");
    expect(fake.statements).toHaveLength(0);
    const result = await adminMembersRepository.getMemberTimelinePage(staff, "member-1", "notes", {limit: 2, search: "", cursor: null});
    const count = fake.statements.length;
    await expect(adminMembersRepository.getMemberTimelinePage(staff, "member-1", "emails", {limit: 2, search: "", cursor: result!.page.nextCursor})).rejects.toThrow("INVALID_CURSOR");
    expect(fake.statements).toHaveLength(count);
  });

  it.each(["engagement", "emails", "events", "purchases", "notes", "journeys", "whatsapp", "suppressions"] as const)("queries only the selected %s history with a bounded SQL limit", async (kind) => {
    const fake = fakeDatabase(); state.database = fake.database;
    const result = await adminMembersRepository.getMemberTimelinePage(staff, "member-1", kind, {limit: 20, search: "", cursor: null});
    expect(result?.kind).toBe(kind);
    expect(fake.statements).toHaveLength(2);
    expect(fake.statements[1].sql).toMatch(/limit\s+\$\d+/i);
    expect(fake.statements[1].params).toContain(21);
    expect(fake.statements[1].params).toContain("member-1");
  });
});
