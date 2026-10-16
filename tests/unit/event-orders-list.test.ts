import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

/**
 * `getDb` is the seam: this fake is the `execute` the repository's real
 * transaction runs against, with each call rendered through the same
 * `PgDialect` a live session uses. Rendering matters — a Drizzle `SQL` object
 * has no `toString()`, so a fake that matched `String(query)` would test
 * `[object Object]` and never discriminate. Same shape as
 * `event-attendees-ticket-rows.test.ts`.
 */
const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {createEventOrdersRepository} from "@/lib/db/repos/event-orders";

const dialect = new PgDialect();

type Rendered = Readonly<{sql: string; params: readonly unknown[]}>;

function fakeDatabase(rows: (statement: string) => readonly unknown[]) {
  const queries: Rendered[] = [];
  const depths: number[] = [];
  let depth = 0;
  const execute = vi.fn(async (query: unknown) => {
    const rendered = dialect.sqlToQuery(query as never);
    queries.push({sql: rendered.sql, params: rendered.params as readonly unknown[]});
    depths.push(depth);
    return {rows: rows(rendered.sql)};
  });
  const db = {
    execute,
    transaction: vi.fn(async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => {
      depth += 1;
      try {
        return await work({execute});
      } finally {
        depth -= 1;
      }
    }),
  };
  return {db, queries, depths};
}

const orderRow = {
  id: "order-1", event_id: "event-1", buyer_profile_id: "p-1", buyer_name: "Ada", buyer_email: "ada@example.test",
  buyer_locale: "zh-HK", amount_hkd_cents: 25_000, currency: "hkd", status: "paid",
  stripe_checkout_session_id: "cs_1", stripe_checkout_url: null, idempotency_key: "idem-1",
  expires_at: "2026-09-14T04:30:00.000Z", paid_at: "2026-09-14T04:05:00.000Z", refunded_at: null, refund_reason: null,
  seat_names: ["Ada Lovelace", "Grace Hopper"], seat_count: 2,
};

describe("listEventOrders", () => {
  it("folds each order through orderFrom and carries its seat aggregate", async () => {
    const fake = fakeDatabase(() => [orderRow]);
    database.current = fake.db;

    const orders = await createEventOrdersRepository().listEventOrders("event-1");

    expect(orders).toHaveLength(1);
    const [row] = orders;
    // A bare cast would leave `eventId` undefined on a snake_case `SELECT *`.
    expect(row.order.eventId).toBe("event-1");
    expect(row.order.buyerLocale).toBe("zh-HK");
    expect(row.order.paidAt).toEqual(new Date("2026-09-14T04:05:00.000Z"));
    expect(row.seatCount).toBe(2);
    expect(row.seatNames).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  it("reads an order with no seats as zero seats rather than throwing", async () => {
    // The LEFT JOIN yields an empty aggregate; a driver may still hand back
    // `null` for the coalesced array, and the mapper must not spread it.
    const fake = fakeDatabase(() => [{...orderRow, seat_names: null, seat_count: 0}]);
    database.current = fake.db;

    const [row] = await createEventOrdersRepository().listEventOrders("event-1");

    expect(row.seatCount).toBe(0);
    expect(row.seatNames).toEqual([]);
  });

  it("filters the aggregate to the requested event", async () => {
    const fake = fakeDatabase(() => []);
    database.current = fake.db;

    await createEventOrdersRepository().listEventOrders("event-42");

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0].sql).toMatch(/event_id\s*=\s*\$1/);
    expect(fake.queries[0].params).toContain("event-42");
  });
});
