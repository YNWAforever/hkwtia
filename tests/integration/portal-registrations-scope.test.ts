import {randomUUID} from "node:crypto";
import {drizzle} from "drizzle-orm/node-postgres";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {portalHistoryPostgres} from "./portal-history-postgres";
const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => databaseState.current}));
import {listOwnRegistrationHistory, readOwnRegistrationStatuses} from "@/lib/db/repos/portal-registrations";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const fixture = portalHistoryPostgres();
const actor = {kind: "member", userId: "auth-subject", profileId: "buyer"} as const;
const eventId = randomUUID(), earlierId = randomUUID();
const ownOrders = Array.from({length: 25}, () => randomUUID()).sort();
const statuses = ["pending", "paid", "expired", "failed", "refunded", "refund_failed", "refund_pending"] as const;

describe.skipIf(!enabled)("registration and order history on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const pool = await fixture.start();
    databaseState.current = drizzle(pool);
    await pool.query("INSERT INTO events (id, title_en, starts_at) VALUES ($1, 'Future', '2099-01-01T00:00:00.123456Z'), ($2, 'Past', '2000-01-01')", [eventId, earlierId]);
    await pool.query("INSERT INTO event_registrations VALUES ($1, $3, 'waitlist'), ($1, 'other', 'registered'), ($2, $3, 'attended')", [eventId, earlierId, actor.profileId]);
    for (const [index, id] of ownOrders.entries()) {
      await pool.query("INSERT INTO event_orders (id, event_id, buyer_profile_id, buyer_email, status, amount_hkd_cents, currency) VALUES ($1, $2, $3, 'attendee@example.test', $4, 25000, 'hkd')", [id, eventId, actor.profileId, statuses[index % statuses.length]]);
    }
    // A matching attendee/buyer email is deliberately not sufficient to claim another buyer or guest order.
    for (const buyer of ["other", null]) await pool.query("INSERT INTO event_orders (id, event_id, buyer_profile_id, buyer_email, status, amount_hkd_cents, currency) VALUES ($1, $2, $3, 'attendee@example.test', 'paid', 25000, 'hkd')", [randomUUID(), eventId, buyer]);
  }, 60_000);
  afterAll(() => fixture.stop());
  it("limits the default page, scopes both sources, and preserves microseconds over all pages", async () => {
    const first = await listOwnRegistrationHistory(actor);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await listOwnRegistrationHistory(actor, {cursor: first.nextCursor});
    expect(second.items).toHaveLength(7);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(all.map((row) => `${row.source}:${row.id}`)).toEqual([`rsvp:${eventId}`, ...ownOrders.map((id) => `ticket:${id}`), `rsvp:${earlierId}`]);
    expect(all[0].startsAt).toBe("2099-01-01T00:00:00.123456Z");
    expect(new Set(all.filter((row) => row.source === "ticket").map((row) => row.status))).toEqual(new Set(statuses));
  });
  it("uses profile identity for persisted RSVP, including refreshed waitlist status", async () => {
    expect(await readOwnRegistrationStatuses(actor, [eventId, earlierId])).toEqual(expect.arrayContaining([
      {eventId, status: "waitlist"}, {eventId: earlierId, status: "attended"},
    ]));
    expect(await readOwnRegistrationStatuses({...actor, profileId: actor.userId}, [eventId])).toEqual([]);
  });
  it("resets a malformed cursor and never drops ownership on subsequent pages", async () => {
    expect(await listOwnRegistrationHistory(actor, {cursor: "bad"})).toMatchObject({cursorReset: true});
    const first = await listOwnRegistrationHistory(actor, {limit: 1});
    const foreign = await listOwnRegistrationHistory({...actor, profileId: "no-history"}, {cursor: first.nextCursor});
    expect(foreign.items).toEqual([]);
  });
});
