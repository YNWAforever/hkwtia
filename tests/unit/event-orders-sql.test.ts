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

function proxyDatabase(
  statements: string[],
  handlers: Readonly<{order?: Record<string, unknown>; event?: Record<string, unknown>; updated?: boolean}> = {},
) {
  const proxy = drizzle(async (query: string) => {
    statements.push(query);
    if (handlers.updated && /UPDATE "event_orders"/i.test(query) && /RETURNING id/i.test(query)) return {rows: [{id: "order-1"}]};
    if (handlers.order && /SELECT \* FROM "event_orders"/.test(query)) return {rows: [handlers.order]};
    if (handlers.event && /FROM "events"/.test(query)) return {rows: [handlers.event]};
    return {rows: []};
  });
  const db = {
    execute: (query: Parameters<typeof proxy.execute>[0]) => proxy.execute(query),
    transaction: async <T,>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  return db;
}

const now = new Date("2026-09-14T04:00:00Z");
const orderRow = {
  id: "order-1", event_id: "ev-1", buyer_profile_id: null, buyer_name: "Ada", buyer_email: "ada@example.test",
  buyer_locale: "en", amount_hkd_cents: 25_000, currency: "hkd", status: "pending",
  stripe_checkout_session_id: "cs_1", stripe_checkout_url: null, idempotency_key: "idem-1",
  expires_at: "2026-09-14T04:30:00.000Z", paid_at: null, refunded_at: null, refund_reason: null,
};
const eventRow = {
  id: "ev-1", capacity: null, published: true, startsAt: "2026-10-01T10:00:00.000Z", endsAt: null,
  registrationMode: "ticketed", ticketPriceHkdCents: 25_000,
};
const statusUpdate = (statements: readonly string[]) =>
  statements.find((statement) => /^update/i.test(statement.trim())) ?? "";

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

/**
 * A status patch is genuinely partial. Writing every column on every transition
 * looks harmless while every transition starts from `pending`, but it turns the
 * NEXT transition destructive: a future staff refund would erase `paid_at`, and
 * an expiry would erase a refund beside it. The render is the only place this
 * can be seen -- the repository's own suite injects a fake transaction.
 */
describe("event order status patches", () => {
  it("writes paid_at for a paid transition and leaves the refund columns alone", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements, {order: orderRow, event: eventRow});

    await createEventOrdersRepository().settlePaid("cs_1", now);

    const update = statusUpdate(statements);
    expect(update).toMatch(/paid_at/);
    expect(update).not.toMatch(/refunded_at/);
    expect(update).not.toMatch(/refund_reason/);
  });

  it("writes the refund columns for a refund and leaves paid_at alone", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements, {order: {...orderRow, status: "expired"}});

    await createEventOrdersRepository().settlePaid("cs_1", now);

    const update = statusUpdate(statements);
    expect(update).toMatch(/refunded_at/);
    expect(update).toMatch(/refund_reason/);
    expect(update).not.toMatch(/paid_at/);
  });

  it("writes no timestamp columns when a transition supplies none", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements, {order: orderRow});

    await createEventOrdersRepository().expireBySession("cs_1");

    const update = statusUpdate(statements);
    expect(update).toMatch(/status/);
    expect(update).not.toMatch(/paid_at/);
    expect(update).not.toMatch(/refunded_at/);
    expect(update).not.toMatch(/refund_reason/);
  });
});

describe("checkout session attachment and release", () => {
  it("attaches a session only to a pending order without another session", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements, {updated: true});
    await expect(createEventOrdersRepository().attachSession("order-1", "cs_1", "https://checkout.stripe.test/1"))
      .resolves.toBe(true);
    const update = statusUpdate(statements);
    expect(update).toMatch(/status\s*=\s*'pending'/);
    expect(update).toMatch(/stripe_checkout_session_id IS NULL/);
    expect(update).toMatch(/stripe_checkout_url IS NULL/);
    expect(update).toMatch(/RETURNING id/);
    const condition = update.split("WHERE")[1] ?? "";
    expect(condition).toMatch(/stripe_checkout_session_id\s*=\s*\$\d+/);
    expect(condition).toMatch(/stripe_checkout_url\s*=\s*\$\d+/);
  });

  it("expires an unattached order and audits the released hold in one transaction", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements, {updated: true});
    await expect(createEventOrdersRepository().expireUnattachedOrder("order-1")).resolves.toBe(true);
    const update = statusUpdate(statements);
    expect(update).toMatch(/SET status\s*=\s*'expired'/);
    expect(update).toMatch(/status\s*=\s*'pending'/);
    expect(update).toMatch(/stripe_checkout_session_id IS NULL/);
    expect(update).toMatch(/stripe_checkout_url IS NULL/);
    expect(update).toMatch(/RETURNING id/);
    expect(statements.join("\n")).toMatch(/INSERT INTO "audit_events"/i);
  });

  it("does not audit when another request has already attached a session", async () => {
    const statements: string[] = [];
    database.current = proxyDatabase(statements);
    await expect(createEventOrdersRepository().expireUnattachedOrder("order-1")).resolves.toBe(false);
    expect(statements.join("\n")).not.toMatch(/INSERT INTO "audit_events"/i);
  });
});
