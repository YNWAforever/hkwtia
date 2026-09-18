import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

/**
 * The same seam as `event-orders-list.test.ts` and `event-orders-sql.test.ts`:
 * `getDb` is mocked and the real transaction runs against a fake `execute`,
 * rendered through `PgDialect` so the statements can be read as SQL. A fake
 * matching `String(query)` would see `[object Object]` and never discriminate.
 */
const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {createEventOrdersRepository} from "@/lib/db/repos/event-orders";

const dialect = new PgDialect();

type Rendered = Readonly<{sql: string; params: readonly unknown[]}>;

function fakeDatabase(updateRows: readonly unknown[]) {
  const queries: Rendered[] = [];
  const depths: number[] = [];
  let depth = 0;
  const execute = vi.fn(async (query: unknown) => {
    const rendered = dialect.sqlToQuery(query as never);
    queries.push({sql: rendered.sql, params: rendered.params as readonly unknown[]});
    depths.push(depth);
    return {rows: /^\s*update/i.test(rendered.sql) ? updateRows : []};
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

const refundedAt = new Date("2026-09-14T05:00:00Z");
const input = {refundedAt, actorUserId: "staff-1", actorType: "staff", refundReason: "staff" as const, reason: "staff", note: "duplicate purchase"};

describe("refundPaidOrder", () => {
  it("commits the refund and its audit row in one transaction", async () => {
    const fake = fakeDatabase([{id: "order-1"}]);
    database.current = fake.db;

    await expect(createEventOrdersRepository().refundPaidOrder("order-1", input)).resolves.toBe(true);

    const update = fake.queries.find((query) => /^\s*update/i.test(query.sql));
    expect(update?.sql).toMatch(/UPDATE\s+"event_orders"/);
    expect(update?.sql).toMatch(/status\s*=\s*'refunded'/);
    // The reason is carried, not hardcoded, so the system issuer can record a
    // different one; it travels as a bound parameter.
    expect(update?.sql).toMatch(/refund_reason\s*=\s*\$\d+/);
    expect(update?.params).toContain("staff");
    expect(update?.params).toContain(refundedAt);
    expect(update?.params).toContain("order-1");

    const audit = fake.queries.find((query) => /^\s*insert/i.test(query.sql));
    expect(audit?.sql).toMatch(/audit_events/);
    // Positional, not set-membership: because the action and the target type are
    // bind parameters, `toContain` on both would pass even if the two were
    // swapped and the audit log named the wrong action — the failure mode the
    // changelog records for `event.review.approved|rejected`. The columns order
    // is (actor_user_id, actor_type, action, target_type, target_id, metadata),
    // and the literal is what D-4a's webhook writes for an oversold refund; only
    // the metadata distinguishes a staff refund from it.
    expect(audit?.params).toEqual([
      "staff-1",
      "staff",
      "event.order.refunded",
      "event_order",
      "order-1",
      JSON.stringify({reason: "staff", note: "duplicate purchase"}),
    ]);

    // Both statements ran inside the single transaction the public method opened.
    expect(fake.db.transaction).toHaveBeenCalledTimes(1);
    expect(fake.depths).toEqual([1, 1]);
  });

  // The whole-branch finding this pins: every refund used to record
  // `reason: "staff"` in the column and the audit metadata, including the
  // event-cancellation sweep's `systemActor`. A report filtering on the reason
  // then attributed a cancellation refund to a person.
  it("records a system cancellation refund as event_cancelled, distinguishable from a staff refund", async () => {
    const fake = fakeDatabase([{id: "order-1"}]);
    database.current = fake.db;

    await expect(createEventOrdersRepository().refundPaidOrder("order-1", {
      refundedAt, actorUserId: null, actorType: "system", refundReason: "cancelled", reason: "event_cancelled", note: "Event cancelled",
    })).resolves.toBe(true);

    const update = fake.queries.find((query) => /^\s*update/i.test(query.sql));
    // The column is the enum home (`cancelled`), the metadata the issuer-specific
    // one (`event_cancelled`); neither says `staff`.
    expect(update?.sql).toMatch(/refund_reason\s*=\s*\$\d+/);
    expect(update?.params).toContain("cancelled");
    expect(update?.params).not.toContain("staff");

    const audit = fake.queries.find((query) => /^\s*insert/i.test(query.sql));
    expect(audit?.params).toEqual([
      null,
      "system",
      "event.order.refunded",
      "event_order",
      "order-1",
      JSON.stringify({reason: "event_cancelled", note: "Event cancelled"}),
    ]);
  });

  it("reports false and writes no audit row when no paid order matched", async () => {
    const fake = fakeDatabase([]);
    database.current = fake.db;

    await expect(createEventOrdersRepository().refundPaidOrder("order-1", input)).resolves.toBe(false);

    expect(fake.queries.some((query) => /^\s*insert/i.test(query.sql))).toBe(false);
    expect(fake.db.transaction).toHaveBeenCalledTimes(1);
  });

  it("gates the update on both the order id and its paid status", async () => {
    const fake = fakeDatabase([{id: "order-1"}]);
    database.current = fake.db;

    await createEventOrdersRepository().refundPaidOrder("order-1", input);

    const update = fake.queries.find((query) => /^\s*update/i.test(query.sql));
    // This conjunction is what makes a double refund impossible: the second
    // staff click matches no row once the first has moved it off `paid`.
    expect(update?.sql).toMatch(/WHERE\s+id\s*=\s*\$\d+\s+AND\s+status\s*=\s*'paid'/);
    expect(update?.params).toContain("order-1");
  });
});
