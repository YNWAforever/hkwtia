import {describe, expect, it, vi} from "vitest";
import type {SQL} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/events/reminder-enrollment", () => ({enrollEventReminder: async () => undefined}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {registerForEvent} from "@/lib/db/repos/events";
import {eventGuestRegistrations, eventRegistrations, events, memberships} from "@/lib/db/server-schema";

const EVENT = "11111111-1111-4111-8111-111111111111";
const actor = {kind: "member", userId: "auth-member", profileId: "profile-member"} as const;

function rows<T>(value: T[], onWhere?: (condition: unknown) => void) {
  const query = {
    where: (condition: unknown) => { onWhere?.(condition); return query; },
    leftJoin: () => query,
    limit: () => query,
    for: () => query,
    then: (resolve: (result: T[]) => unknown) => Promise.resolve(value).then(resolve),
  };
  return query;
}

describe("member RSVP capacity shared with guests", () => {
  it("waitlists a member when a guest already occupies the only seat", async () => {
    const tables: unknown[] = [];
    const guestPredicates: Array<{sql: string; params: unknown[]}> = [];
    const writes: unknown[] = [];
    database.current = {
      transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        select: (fields: Record<string, unknown>) => ({from: (table: unknown) => {
          tables.push(table);
          if (table === events) {
            expect(Object.keys(fields)).toEqual(expect.arrayContaining(["registrationMode", "visibility"]));
            return rows([{id: EVENT, capacity: 1, published: true, registrationMode: "rsvp", visibility: "public", startsAt: new Date("2099-01-01"), endsAt: null}]);
          }
          if (table === memberships) return rows([{id: "membership-1"}]);
          if (table === eventRegistrations) return rows("value" in fields ? [{value: 0}] : []);
          if (table === eventGuestRegistrations) return rows([{value: 1}], (condition) => guestPredicates.push(new PgDialect().sqlToQuery(condition as SQL)));
          throw new Error("unexpected table");
        }}),
        insert: (table: unknown) => ({values: (value: unknown) => {
          writes.push({table, value});
          return {onConflictDoUpdate: async () => undefined, then: (resolve: (result: void) => unknown) => Promise.resolve().then(resolve)};
        }}),
      }),
    };

    await expect(registerForEvent(actor, {eventId: EVENT})).resolves.toEqual({disposition: "waitlist"});
    expect(tables).toContain(eventGuestRegistrations);
    expect(guestPredicates).toHaveLength(1);
    expect(guestPredicates[0]!.sql).toContain('event_guest_registrations');
    expect(guestPredicates[0]!.params).toContain(EVENT);
    expect(guestPredicates[0]!.params).toContain('registered');
    expect(guestPredicates[0]!.params).toContain('attended');
    expect(guestPredicates[0]!.params).not.toContain('waitlist');
    expect(writes).toContainEqual(expect.objectContaining({
      table: eventRegistrations,
      value: expect.objectContaining({status: "waitlist"}),
    }));
  });
});