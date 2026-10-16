import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {listEventAttendeePage} from "@/lib/db/repos/events";

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherEventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const staff = {kind: "staff", userId: "staff-a", profileId: "staff-a"} as const;
const dialect = new PgDialect();

function fakeDatabase() {
  const statements: {sql: string; params: readonly unknown[]}[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const rendered = dialect.sqlToQuery(query as never);
    statements.push({sql: rendered.sql, params: rendered.params as readonly unknown[]});
    if (/select .* as id from "events"/i.test(rendered.sql)) return {rows: [{id: eventId}]};
    return {rows: [
      {kind: "guest", profile_id: null, guest_id: "guest-1", seat_id: null, order_id: null, display_name: "Ada", email: "a@example.test", organisation: null, status: "registered", checked_in_at: null, item_id: "guest-1"},
      {kind: "member", profile_id: "member-1", guest_id: null, seat_id: null, order_id: null, display_name: "Ada", sort_name: "database-sort-key", email: "b@example.test", organisation: null, status: "registered", checked_in_at: null, item_id: "member-1"},
      {kind: "ticket", profile_id: null, guest_id: null, seat_id: "seat-1", order_id: "order-1", display_name: "Ada", email: "c@example.test", organisation: null, status: "paid", checked_in_at: null, item_id: "seat-1"},
    ]};
  });
  return {database: {execute}, statements};
}

describe("admin attendee cursor page", () => {
  it("bounds the union in SQL and uses kind plus item ID to break identical names", async () => {
    const fake = fakeDatabase();
    const page = await listEventAttendeePage(staff, eventId, {limit: 2, search: "Ada", cursor: null}, {loadDatabase: async () => fake.database as never});
    expect(page?.items.map((item) => item.kind)).toEqual(["guest", "member"]);
    expect(page?.nextCursor).toBeTruthy();
    expect(fake.statements).toHaveLength(2);
    expect(fake.statements[1].sql).toMatch(/order by lower\(display_name\) asc, kind asc, item_id asc/i);
    expect(fake.statements[1].sql).toMatch(/limit\s+\$\d+/i);
    expect(fake.statements[1].params).toContain(3);
    expect(fake.statements[1].sql).toMatch(/seat_id::text/i);
    await listEventAttendeePage(staff, eventId, {limit: 2, search: "Ada", cursor: page!.nextCursor}, {loadDatabase: async () => fake.database as never});
    expect(fake.statements[3].sql).toMatch(/\(lower\(display_name\), kind, item_id\)\s*>/i);
    expect(fake.statements[3].params).toContain("member-1");
    expect(fake.statements[3].params).toContain("database-sort-key");
  });

  it("rejects an unbounded page or a cursor from another event before any query", async () => {
    const fake = fakeDatabase();
    await expect(listEventAttendeePage(staff, eventId, {limit: Infinity, search: "", cursor: null}, {loadDatabase: async () => fake.database as never})).rejects.toThrow();
    const page = await listEventAttendeePage(staff, eventId, {limit: 2, search: "", cursor: null}, {loadDatabase: async () => fake.database as never});
    const count = fake.statements.length;
    await expect(listEventAttendeePage(staff, otherEventId, {limit: 2, search: "", cursor: page!.nextCursor}, {loadDatabase: async () => fake.database as never})).rejects.toThrow("INVALID_CURSOR");
    expect(fake.statements).toHaveLength(count);
  });

  it("rejects a member actor", async () => {
    const fake = fakeDatabase();
    await expect(listEventAttendeePage({kind: "member", userId: "member", profileId: "member"}, eventId, {}, {loadDatabase: async () => fake.database as never})).rejects.toThrow("FORBIDDEN");
    expect(fake.statements).toHaveLength(0);
  });
});
