import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

// The repository owns its transaction; the proxy driver lets these tests read
// the SQL it would run without a database. Same seam as
// `repository-exists-scope-sql.test.ts`.
const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {createEventOrdersRepository} from "@/lib/db/repos/event-orders";

function proxyDatabase(statements: string[]) {
  const proxy = drizzle(async (query: string) => {
    statements.push(query);
    return {rows: []};
  });
  const db = {
    execute: (query: Parameters<typeof proxy.execute>[0]) => proxy.execute(query),
    transaction: async <T,>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  return db;
}

describe("event orders SQL", () => {
  it("counts paid seats as the paid-order seats of one event", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements);

    await createEventOrdersRepository().paidSeats("11111111-1111-4111-8111-111111111111");

    const rendered = statements.join("\n");
    expect(rendered).toMatch(/event_order_seats/);
    expect(rendered).toMatch(/o\.event_id/);
    // Paid is a strict subset of held: it must not admit pending seats, or the
    // staff "paid" figure would include checkouts that never completed.
    expect(rendered).toMatch(/o\.status\s*=\s*'paid'/);
    expect(rendered).not.toMatch(/'pending'/);
  });
});
