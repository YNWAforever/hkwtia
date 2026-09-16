import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {cancelEvent, cancellationPreview, type MemberEventRow} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const EVENT = "22222222-2222-4222-8222-222222222222";
const staff: Actor = {kind: "staff", userId: "s", profileId: "staff-1"};
const member: Actor = {kind: "member", userId: "u", profileId: "member-1"};
const dialect = new PgDialect();

/** A full snake_case row as `SELECT * FROM events` returns it; the repository parses every read. */
function row(overrides: Partial<MemberEventRow> = {}): MemberEventRow {
  return {
    id: EVENT, slug: "ai-clinic-2026", title_en: "AI Clinic", title_zh: null, description_en: "Hands-on session", description_zh: null,
    starts_at: new Date("2030-03-01T02:00:00Z"), ends_at: new Date("2030-03-01T04:00:00Z"), venue: "KOHO", capacity: 40,
    status: "published", visibility: "public", format: "in_person", online_url: null, registration_mode: "ticketed", external_registration_url: null,
    tags: ["ai"], hero_media_id: null, organiser_company_id: null, submitted_by_profile_id: null,
    submitted_at: null, published_at: new Date("2026-01-01T00:00:00Z"), reviewed_at: null, rejection_reason: null,
    published: true, member_only: false,
    ...overrides,
  };
}

/**
 * The write runs inside a transaction and the read does not, so the two
 * executes are separate spies over one shared queue. `used` says which one each
 * statement was dispatched through: a write that audited on the outer handle
 * would still pass an "audit happened" assertion, so the transaction boundary
 * has to be observable, not assumed.
 */
function fakeDeps(queue: (Record<string, unknown>[] | Error)[] = [[]]) {
  const pending = [...queue];
  const used: ("transaction" | "outer")[] = [];
  const next = async (via: "transaction" | "outer") => {
    used.push(via);
    const value = pending.shift() ?? [];
    if (value instanceof Error) throw value;
    return value;
  };
  const execute = vi.fn<(query: unknown) => Promise<Record<string, unknown>[]>>(() => next("outer"));
  const txExecute = vi.fn<(query: unknown) => Promise<Record<string, unknown>[]>>(() => next("transaction"));
  const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof txExecute}) => Promise<T>) => work({execute: txExecute})};
  return {execute, txExecute, used, deps: {loadDatabase: async () => database as never}};
}

/** The literal SQL text of a drizzle `sql` object: its string chunks, nested templates included, without parameters or identifiers. */
function literalText(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  if ("queryChunks" in chunk && Array.isArray(chunk.queryChunks)) return chunk.queryChunks.map(literalText).join("");
  if ("value" in chunk && Array.isArray(chunk.value)) return chunk.value.join("");
  return "";
}

function statementText(execute: ReturnType<typeof fakeDeps>["txExecute"], call: number): string {
  return literalText(execute.mock.calls[call]?.[0]);
}

/** The bound parameter values of a drizzle `sql` object, in order, nested templates included. */
function paramValues(chunk: unknown): unknown[] {
  if (chunk === null || chunk === undefined) return [];
  if (typeof chunk !== "object" || chunk instanceof Date) return [chunk];
  if ("queryChunks" in chunk && Array.isArray(chunk.queryChunks)) return chunk.queryChunks.flatMap(paramValues);
  if ("value" in chunk && !Array.isArray(chunk.value)) return [chunk.value];
  return [];
}

describe("cancelEvent", () => {
  it("requires an admin before any SQL", async () => {
    const {execute, txExecute, deps} = fakeDeps();
    await expect(cancelEvent(member, EVENT, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
    expect(txExecute).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid before any SQL", async () => {
    const {execute, txExecute, deps} = fakeDeps();
    await expect(cancelEvent(staff, "not-a-uuid", deps)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(txExecute).not.toHaveBeenCalled();
  });

  // The heart of the write: the status, the derived flags and the audit row are
  // three statements in one transaction, in that order. Asserting only that the
  // returned row says "cancelled" would pin the fixture, not the SQL, because
  // the fake feeds back whatever the test queued.
  it("locks the row, moves status and derived flags together, and audits the actor in the same transaction", async () => {
    const {execute, txExecute, used, deps} = fakeDeps([
      [row({status: "published", published: true, member_only: false})],
      [row({status: "cancelled", published: false, member_only: false})],
      [],
    ]);

    const outcome = await cancelEvent(staff, EVENT, deps);

    expect(outcome).toMatchObject({status: "cancelled"});
    expect(outcome.status === "cancelled" && outcome.event.status).toBe("cancelled");
    expect(outcome.status === "cancelled" && outcome.event.published).toBe(false);
    // Every statement ran through the transaction handle; nothing touched the
    // outer database, which is what makes the three writes one unit.
    expect(used).toEqual(["transaction", "transaction", "transaction"]);
    expect(execute).not.toHaveBeenCalled();

    expect(statementText(txExecute, 0)).toContain("FOR UPDATE");

    const update = statementText(txExecute, 1);
    expect(update).toContain("UPDATE");
    expect(update).toContain("status = 'cancelled'");
    expect(update).toContain("published =");
    // `derivedEventFlags({status: "cancelled", …})` answers `published: false`,
    // so the flag travels with the status rather than beside it.
    expect(paramValues(txExecute.mock.calls[1]?.[0])).toContain(false);
    expect(paramValues(txExecute.mock.calls[1]?.[0])).toContain(EVENT);

    const audit = statementText(txExecute, 2);
    expect(audit).toContain("INSERT INTO");
    expect(audit).toContain("'event.cancelled'");
    expect(audit).toContain("'event'");
    // The actor is named on the row, not inferred from the page.
    expect(paramValues(txExecute.mock.calls[2]?.[0])).toContain(staff.profileId);
    expect(paramValues(txExecute.mock.calls[2]?.[0])).toContain("staff");
    expect(paramValues(txExecute.mock.calls[2]?.[0])).toContain(EVENT);
  });

  // `canTransitionEvent("cancelled", "cancelled")` is TRUE because the table maps
  // cancelled to ["cancelled"]. Without the explicit refusal the write would run a
  // second time and mint a second `event.cancelled` audit row for one cancellation.
  // This test is the pin: delete the explicit refusal and the outcome becomes
  // `cancelled` with three transaction statements instead of one lock.
  it("refuses an already-cancelled event explicitly and writes no second audit row", async () => {
    const {execute, txExecute, used, deps} = fakeDeps([
      [row({status: "cancelled", published: false, member_only: false})],
    ]);

    await expect(cancelEvent(staff, EVENT, deps)).resolves.toEqual({status: "already_cancelled"});

    // Only the lock ran. No UPDATE, no audit: `cancelled` is terminal.
    expect(used).toEqual(["transaction"]);
    expect(statementText(txExecute, 0)).toContain("FOR UPDATE");
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["draft", "rejected"] as const)("refuses a %s event via the transition table without writing", async (status) => {
    const {execute, used, deps} = fakeDeps([[row({status, published: false, member_only: false})]]);

    await expect(cancelEvent(staff, EVENT, deps)).resolves.toEqual({status: "invalid_transition", from: status});

    expect(used).toEqual(["transaction"]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a missing event without writing", async () => {
    const {execute, used, deps} = fakeDeps([[]]);

    await expect(cancelEvent(staff, EVENT, deps)).resolves.toEqual({status: "not_found"});

    expect(used).toEqual(["transaction"]);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("cancellationPreview", () => {
  it("requires an admin before any SQL", async () => {
    const {execute, deps} = fakeDeps();
    await expect(cancellationPreview(member, EVENT, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns the paid-order count, the refund total, the seats those orders cover and the RSVP registrants", async () => {
    const {execute, deps} = fakeDeps([[{paid_orders: 2, refund_total_hkd_cents: 100_000, attendees: 3, rsvp_registrants: 7}]]);

    await expect(cancellationPreview(staff, EVENT, deps)).resolves.toEqual({paidOrders: 2, refundTotalHkdCents: 100_000, attendees: 3, rsvpRegistrants: 7});

    expect(execute).toHaveBeenCalledTimes(1);
    const text = statementText(execute, 0);
    // The table identifiers are dialect-rendered: `literalText` intentionally
    // drops them, so the two registrant tables are asserted on the full SQL.
    const rendered = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as never).sql;
    // The aggregates are separate scalar subqueries. A single SELECT over a join
    // of orders to seats multiplies each order amount by its seat count, so the
    // refund total would silently overstate what is paid back. The count of
    // SELECTs is the shape pin: one outer, three order/seat subqueries, and the
    // two registrant subqueries (members and guests are different tables).
    expect(text.match(/SELECT/gi)).toHaveLength(6);
    expect(text).toContain("AS paid_orders");
    expect(text).toContain("AS refund_total_hkd_cents");
    expect(text).toContain("AS attendees");
    expect(text).toContain("AS rsvp_registrants");
    // The door list reads both tables; the preview must not lose one of them.
    expect(rendered).toContain("event_registrations");
    expect(rendered).toContain("event_guest_registrations");
    // Only paid orders are refunded; a pending or expired order is not money.
    expect(text.match(/'paid'/g)).toHaveLength(3);
    // A registrar who cancelled their own place is not a registrant, on either
    // table.
    expect(text.match(/'cancelled'/g)).toHaveLength(2);
  });

  // The finding this test pins: counting only paid-order seats made a free RSVP
  // event read as "0 attendees" -- the exact event where cancelling emails
  // nobody. Registrants are counted from their own tables, so the figure is real
  // even when no order was ever paid.
  it("counts RSVP registrants on a free event, where the paid figures are all zero", async () => {
    const {execute, deps} = fakeDeps([[{paid_orders: 0, refund_total_hkd_cents: 0, attendees: 0, rsvp_registrants: 5}]]);

    await expect(cancellationPreview(staff, EVENT, deps)).resolves.toEqual({paidOrders: 0, refundTotalHkdCents: 0, attendees: 0, rsvpRegistrants: 5});

    expect(statementText(execute, 0)).toContain("AS rsvp_registrants");
  });

  it("returns zeroes for an event nobody paid for, rather than null", async () => {
    const {deps} = fakeDeps([[{paid_orders: 0, refund_total_hkd_cents: 0, attendees: 0, rsvp_registrants: 0}]]);
    await expect(cancellationPreview(staff, EVENT, deps)).resolves.toEqual({paidOrders: 0, refundTotalHkdCents: 0, attendees: 0, rsvpRegistrants: 0});
  });

  it("returns null for an event that does not exist", async () => {
    const {deps} = fakeDeps([[]]);
    await expect(cancellationPreview(staff, EVENT, deps)).resolves.toBeNull();
  });
});
