import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

/**
 * D-4d Task 2, review Finding 2. The sweep's work list decides which orders a
 * cancelled event refunds, and nothing in the suite rendered its statement:
 * `event-orders-repository.test.ts` stubs `ordersAwaitingCancellationRefund`
 * only to satisfy the transaction type, and the runner test hands `listOrders`
 * hardcoded rows, so a predicate that widened to `WHERE TRUE` — the exact
 * failure Phase C2 recorded, where a dropped filter answered "everyone" — would
 * pass CI. This renders the real statement through the pg-proxy driver and
 * asserts each term, so deleting any one fails here rather than in production.
 *
 * Dropping `o.status = 'paid'` refunds orders that were never paid. Dropping
 * `e.status = 'cancelled'` refunds every paid order on the site. Dropping the
 * `LIMIT` walks an unbounded backlog in one run.
 */
const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {eventOrdersRepository} from "@/lib/db/repos/event-orders";

type Statement = Readonly<{sql: string; params: readonly unknown[]}>;

function capture() {
  const statements: Statement[] = [];
  const proxy = drizzle(async (query: string, params: unknown[]) => {
    statements.push({sql: query, params});
    return {rows: []};
  });
  // `defaultTransaction` opens a transaction before it builds the statement, and
  // the pg-proxy driver does not implement one, so the loader hands it a
  // pass-through transaction over the proxy's `execute`.
  database.current = {
    transaction: async <T,>(work: (tx: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>) =>
      work({execute: (query) => proxy.execute(query as never)}),
  };
  return statements;
}

describe("the event-cancellation sweep read", () => {
  it("selects paid and failed-refund orders of cancelled events, bounded by the batch limit", async () => {
    const statements = capture();

    await eventOrdersRepository.ordersAwaitingCancellationRefund(100);

    expect(statements).toHaveLength(1);
    const {sql, params} = statements[0]!;

    // Only paid orders and failed refunds need provider attention.
    expect(sql).toMatch(/o\.status\s+IN\s*\('paid',\s*'refund_failed'\)/);
    // The `cancelled` filter: without it the sweep refunds every paid order.
    expect(sql).toMatch(/e\.status\s*=\s*'cancelled'/);
    // Each arm reads the column off its own table, so a swapped alias cannot
    // make one filter silently answer the other's question.
    expect(sql).toMatch(/FROM\s+"event_orders"\s+o\s+JOIN\s+"events"\s+e\s+ON\s+e\.id\s*=\s*o\.event_id/i);
    // The bound: without it one run walks the whole backlog.
    expect(sql).toMatch(/LIMIT\s+\$\d+/i);
    expect(params).toContain(100);
    // Failed attempts move to the tail so a full batch cannot hide later orders.
    expect(sql).toMatch(/ORDER\s+BY\s+o\.updated_at\s+ASC/i);
  });

  it("moves a failed order to the alert tail without changing its refund status", async () => {
    const statements = capture();
    await eventOrdersRepository.deferUnsettledCancellationRefund("order-1");
    expect(statements).toHaveLength(1);
    const {sql, params} = statements[0]!;
    expect(sql).toMatch(/UPDATE\s+"event_orders"/i);
    expect(sql).toMatch(/updated_at\s*=\s*NOW\(\)/i);
    expect(sql).toMatch(/status\s+IN\s*\('paid',\s*'refund_failed'\)/i);
    expect(params).toContain("order-1");
  });
});
