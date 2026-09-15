import {readFileSync} from "node:fs";
import path from "node:path";

import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {listEventAttendees} from "@/lib/db/repos/events";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const eventId = "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";
const dialect = new PgDialect();

/**
 * Drizzle's `SQL` has no `toString()` — `String(query)` is always
 * `[object Object]` — so the original fake's `String(query).includes(...)`
 * predicate was never true and *both* the existence probe and the union
 * returned the scripted rows. The probe could not be told apart from the
 * union, so a deleted or malformed ticket arm was invisible: the behavioural
 * cases below read scripted rows, so they prove the mapper, not the statement.
 * Render each call through the same `PgDialect` the production session uses
 * and hand back the probe's id row only for the statement that is the probe.
 */
function database(rows: readonly unknown[]) {
  const statements: string[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const text = dialect.sqlToQuery(query as never).sql;
    statements.push(text);
    return text.includes('FROM "events"') && !text.includes("UNION")
      ? {rows: [{id: eventId}]}
      : {rows};
  });
  return {execute, statements};
}

const ticketRow = {
  kind: "ticket", profile_id: null, guest_id: null, seat_id: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f",
  order_id: "b1a2c3d4-1111-4222-8333-944455566677", display_name: "Ada Lovelace", email: "ada@example.test",
  organisation: null, status: "paid", checked_in_at: null,
};

describe("the door list", () => {
  it("carries ticket seats alongside members and guests, keyed by seat", async () => {
    const db = database([ticketRow]);
    const rows = await listEventAttendees(staff, eventId, {loadDatabase: async () => db as never});
    expect(rows).toEqual([{kind: "ticket", profileId: null, guestId: null, seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", orderId: "b1a2c3d4-1111-4222-8333-944455566677", displayName: "Ada Lovelace", email: "ada@example.test", organisation: null, status: "paid", checkedInAt: null}]);
  });

  it("still validates the member and guest arms after the union widens", async () => {
    const db = database([{kind: "nonsense", profile_id: null, guest_id: null, seat_id: null, order_id: null, display_name: "x", email: null, organisation: null, status: "paid", checked_in_at: null}]);
    await expect(listEventAttendees(staff, eventId, {loadDatabase: async () => db as never})).rejects.toThrow();
  });

  /**
   * Source-level assertions on the generated SQL, the shape
   * `repository-exists-scope-sql.test.ts` uses for SQL no unit test executes
   * against Postgres. Nothing else can catch a deleted ticket arm, a dropped
   * `status = 'paid'` filter, a wrong join or swapped seat/order projections:
   * the behavioural cases above never look at the statement.
   */
  it("renders the paid ticket arm into the door-list union", async () => {
    const db = database([ticketRow]);
    await listEventAttendees(staff, eventId, {loadDatabase: async () => db as never});

    const probe = db.statements.filter((statement) => !statement.includes("UNION"));
    const unions = db.statements.filter((statement) => statement.includes("UNION"));
    expect(probe).toHaveLength(1);
    expect(unions).toHaveLength(1);

    const union = unions[0];
    expect(union).toContain("UNION ALL");
    expect(union).toContain("'ticket'");
    expect(union).toMatch(/"event_orders"\."status"\s*=\s*'paid'/);
    expect(union).toMatch(/FROM\s+"event_order_seats"\s+JOIN\s+"event_orders"\s+ON\s+"event_orders"\."id"\s*=\s*"event_order_seats"\."order_id"/);
    expect(union).toMatch(/SELECT\s+'ticket',\s*NULL::text,\s*NULL::uuid,\s*"event_order_seats"\."id",\s*"event_orders"\."id"/);
  });
});

describe("the door-list status labels", () => {
  const emittedStatuses = ["registered", "waitlist", "cancelled", "attended", "no_show", "paid"] as const;

  /**
   * A ticket seat's arm filters on the literal `'paid'` (`eventOrders.status =
   * 'paid'`), so the door list can render that status — but the label map had
   * only the five registration statuses and every ticket row fell back to
   * "Not available". The page builds its map inline, so the only way to keep
   * every emitted status mapped is to read it.
   */
  it("labels every status the door list can emit, including a paid ticket seat", () => {
    for (const bundle of [en, zh]) {
      const statuses = bundle.Admin.eventsMgmt.statuses as Record<string, string>;
      for (const key of ["registered", "waitlist", "cancelled", "attended", "noShow", "paid"]) {
        expect(statuses[key]).toBeTruthy();
      }
    }

    const page = readFileSync(path.resolve(__dirname, "../../app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx"), "utf8");
    const map = page.match(/const attendeeLabels[^\n]*?statuses:\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(map).not.toBe("");
    for (const key of emittedStatuses) {
      expect(map).toContain(key + ":");
    }
    expect(map).toMatch(/\bpaid:\s*t\("statuses\.paid"\)/);
  });
});
