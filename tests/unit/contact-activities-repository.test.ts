import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";
import {ZodError} from "zod";

import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import {createContactActivitiesRepository} from "@/lib/db/repos/contact-activities";

const dialect = new PgDialect();
type Statement = {text: string; params: unknown[]};
type Row = Record<string, unknown>;

function fakeDatabase(responses: readonly Row[][] = [[]]) {
  const outer: Statement[] = [];
  const transactions: Statement[][] = [];
  const queue = [...responses];
  const render = (query: unknown): Statement => {
    const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
    return {text: rendered.sql, params: rendered.params};
  };
  const next = () => (queue.length > 1 ? queue.shift()! : (queue[0] ?? []));
  const database = {
    async execute(query: unknown) {
      outer.push(render(query));
      return {rows: next()};
    },
    async transaction<T>(work: (transaction: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>): Promise<T> {
      const statements: Statement[] = [];
      transactions.push(statements);
      return work({
        async execute(query: unknown) {
          statements.push(render(query));
          return {rows: next()};
        },
      });
    },
  };
  return {database, outer, transactions};
}

const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"} as const;
const member = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const contactId = "11111111-1111-4111-8111-111111111111";

function activityRow(overrides: Row = {}): Row {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    contact_id: contactId,
    actor_profile_id: "staff-a",
    actor_name: "Sam Staff",
    kind: "note",
    body: "Called back",
    meta: {},
    created_at: new Date("2026-10-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("contactActivitiesRepository", () => {
  it.each([["member", member], ["anonymous", ANONYMOUS_ACTOR]] as const)(
    "refuses a %s actor on list and addNote before the database loads",
    async (_name, forged) => {
      const loadDatabase = vi.fn();
      const repository = createContactActivitiesRepository(loadDatabase);
      await expect(repository.list(forged as never, contactId)).rejects.toThrow("FORBIDDEN");
      await expect(repository.addNote(forged as never, contactId, "hello")).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );

  it("lists newest first with the actor's name", async () => {
    const fake = fakeDatabase([[activityRow()]]);
    const repository = createContactActivitiesRepository(async () => fake.database as never);
    const items = await repository.list(admin, contactId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({kind: "note", actorName: "Sam Staff", body: "Called back"});
    const text = fake.outer[0]?.text.replace(/\s+/g, " ").toLowerCase() ?? "";
    expect(text).toMatch(/order by .*created_at.* desc/);
  });

  it.each([["empty", ""], ["blank", "   "], ["too long", "x".repeat(2001)]])(
    "rejects a %s note before the database loads",
    async (_name, body) => {
      const loadDatabase = vi.fn();
      const repository = createContactActivitiesRepository(loadDatabase);
      await expect(repository.addNote(admin, contactId, body)).rejects.toThrow(ZodError);
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );

  it("writes the activity, last_touch_at and the audit row in one transaction", async () => {
    const fake = fakeDatabase([[{id: contactId}], [activityRow()], []]);
    const repository = createContactActivitiesRepository(async () => fake.database as never);

    const note = await repository.addNote(admin, contactId, "  Called back  ");

    expect(note.body).toBe("Called back");
    expect(fake.outer).toEqual([]);
    expect(fake.transactions).toHaveLength(1);
    const statements = fake.transactions[0]!;
    expect(statements.some((s) => /insert into "contact_activities"/i.test(s.text))).toBe(true);
    expect(statements.some((s) => /update "contacts"/i.test(s.text) && /last_touch_at/i.test(s.text))).toBe(true);
    const audit = statements.find((s) => /insert into "audit_events"/i.test(s.text));
    expect(audit?.text).toContain("contact.note_added");
  });
});
