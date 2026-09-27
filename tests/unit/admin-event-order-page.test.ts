import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => state.database};
});
import {listEventOrderPage} from "@/lib/db/repos/event-orders";

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staff = {kind: "staff", userId: "staff-a", profileId: "staff-a"} as const;
const dialect = new PgDialect();
const baseOrder = {event_id: eventId, buyer_profile_id: "p-1", buyer_name: "Ada", buyer_email: "ada@example.test", buyer_locale: "en", amount_hkd_cents: 2500, currency: "hkd", status: "paid", stripe_checkout_session_id: null, stripe_checkout_url: null, idempotency_key: "key", expires_at: new Date("2026-10-02"), paid_at: new Date("2026-09-28"), refunded_at: null, refund_reason: null, seat_count: 1, seat_names: ["Ada"]};

function fakeDatabase() {
  const statements: {sql: string; params: readonly unknown[]}[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const rendered = dialect.sqlToQuery(query as never);
    statements.push({sql: rendered.sql, params: rendered.params as readonly unknown[]});
    if (/select .* as id from "events"/i.test(rendered.sql)) return {rows: [{id: eventId}]};
    return {rows: [
      {...baseOrder, id: "11111111-1111-4111-8111-111111111111", created_at: new Date("2026-09-27T01:00:00Z")},
      {...baseOrder, id: "22222222-2222-4222-8222-222222222222", created_at: new Date("2026-09-27T01:00:00Z")},
      {...baseOrder, id: "33333333-3333-4333-8333-333333333333", created_at: new Date("2026-09-26T01:00:00Z")},
    ]};
  });
  return {database: {execute}, statements};
}

describe("admin event orders page", () => {
  it("limits orders before joining seats and breaks same-time ties by ID", async () => {
    const fake = fakeDatabase(); state.database = fake.database;
    const page = await listEventOrderPage(staff, eventId, {search: "Ada", limit: 2, cursor: null});
    expect(page?.items.map((item) => item.order.id)).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    expect(page?.nextCursor).toBeTruthy();
    expect(fake.statements[1].sql).toMatch(/page_orders as/i);
    expect(fake.statements[1].sql).toMatch(/limit\s+\$\d+/i);
    expect(fake.statements[1].sql).toMatch(/order by .*created_at desc.*id desc/is);
    expect(fake.statements[1].params).toContain(3);
    await listEventOrderPage(staff, eventId, {search: "Ada", limit: 2, cursor: page!.nextCursor});
    expect(fake.statements[3].sql).toMatch(/\(.*created_at, .*id\)\s*</is);
    expect(fake.statements[3].params).toContain("22222222-2222-4222-8222-222222222222");
  });

  it("rejects unbounded limits and member actors before database access", async () => {
    const fake = fakeDatabase(); state.database = fake.database;
    await expect(listEventOrderPage(staff, eventId, {search: "", limit: Infinity, cursor: null})).rejects.toThrow();
    await expect(listEventOrderPage({kind: "member", userId: "m", profileId: "m"}, eventId, {})).rejects.toThrow("FORBIDDEN");
    expect(fake.statements).toHaveLength(0);
  });
});
