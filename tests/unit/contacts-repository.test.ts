import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";

const dialect = new PgDialect();

/** A fake whose statements can be read, for the two-statement member-id write. */
function recordingDatabase(
  responses: readonly (Record<string, unknown>[] | Error)[],
) {
  const statements: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const queue = [...responses];
  const execute = vi.fn(async (query: never) => {
    statements.push(dialect.sqlToQuery(query));
    const next = queue.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  });
  return {statements, execute, database: {execute} as never};
}

function duplicateKeyError() {
  return Object.assign(new Error("duplicate key value"), {code: "23505"});
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function fakeDatabase(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn(async () => rows);
  return {execute, database: {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}};
}

const interestInput = {email: "a@b.hk", locale: "en" as const, whatsappOptIn: false, whatsappNumber: null, displayName: null};

describe("contactsRepository", () => {
  it("refuses a member or anonymous actor", async () => {
    const {database} = fakeDatabase();
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.upsertFromInterestForm({kind: "anonymous", userId: null}, interestInput)).rejects.toThrow("FORBIDDEN");
    await expect(repository.upsertFromInterestForm({kind: "member", userId: "u", profileId: "p"}, interestInput)).rejects.toThrow("FORBIDDEN");
  });

  it("refuses a forged contact-writer object that lacks the capability symbol", async () => {
    const {database, execute} = fakeDatabase([{id: "c-0"}]);
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.upsertFromInterestForm({kind: "contact-writer", userId: null, source: "interest_form"}, interestInput)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("upserts an interest-form contact and returns the row id", async () => {
    const {database, execute} = fakeDatabase([{id: "c-1"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ADA@example.hk", locale: "zh-HK", whatsappOptIn: true, whatsappNumber: "+85291234567", displayName: "Ada",
    });
    expect(result).toEqual({id: "c-1", disposition: "upserted"});
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("records the consent source the caller names, defaulting to the interest form", async () => {
    const {database, execute} = fakeDatabase([{id: "c-3"}]);
    const repository = createContactsRepository(async () => database as never);
    // drizzle's sql`` keeps interpolated primitives unwrapped in queryChunks; SQL text arrives as StringChunk objects.
    const params = () => (execute.mock.calls.at(-1) as unknown as [{queryChunks: unknown[]}])[0].queryChunks
      .filter((chunk) => typeof chunk === "string");

    await repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, whatsappOptIn: true, whatsappNumber: "+85291234567", consentSource: "rsvp"});
    expect(params()).toContain("rsvp");
    await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {...interestInput, whatsappOptIn: true, whatsappNumber: "+85291234567"});
    expect(params()).toContain("interest_form");
    expect(params()).not.toContain("rsvp");
    // No opt-in, no consent source: the column must stay null whatever the caller passed.
    await repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, consentSource: "rsvp"});
    expect(params()).not.toContain("rsvp");
    await expect(repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, consentSource: "forged"})).rejects.toThrow();
  });

  it("records an unknown WhatsApp sender by phone", async () => {
    const {database} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
      phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-08T00:00:00Z"),
    });
    expect(result).toEqual({id: "c-2", disposition: "upserted"});
  });

  /**
   * C-3 Task 11. `source` used to be the literal `'whatsapp'`, so C-3's backfill
   * — which passes `contactWriterActor("import")` and whose comment claimed the
   * source made a backfilled contact greppable — wrote rows indistinguishable
   * from a live inbound. The INSERT arm carries the actor's source; the ON
   * CONFLICT arm still touches `last_inbound_at` only, so an import can never
   * relabel a contact who arrived live.
   */
  it("writes the actor's source rather than a hard-coded whatsapp", async () => {
    const {database, statements} = recordingDatabase([[{id: "c-8"}], [{id: "c-9"}]]);
    const repository = createContactsRepository(async () => database);

    await repository.upsertFromWhatsApp(contactWriterActor("import"), {
      phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-08T00:00:00Z"),
    });
    expect(statements[0]?.params).toContain("import");
    expect(normalized(statements[0]?.sql)).not.toContain("'whatsapp'");

    await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
      phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-08T00:00:00Z"),
    });
    expect(statements[1]?.params).toContain("whatsapp");
    // The update arm is the only thing a repeat touches, so nothing an import
    // does can rewrite the source of a contact who arrived live.
    expect(normalized(statements[1]?.sql)).toContain("do update set last_inbound_at");
  });

  /**
   * C-1 Task 4. `upsertFromWhatsApp` conflicts on `contacts_phone_unique` only,
   * while `contacts_whatsapp_member_unique` is a SEPARATE partial unique index
   * and therefore not the conflict target. Carrying the member id in the upsert
   * meant an inbound whose id already belonged to a different phone row raised
   * 23505 → a 500 from the webhook route → Woztell retrying that sender's
   * message forever, so that sender's messages never persisted at all. Now the
   * member id is a second, separately guarded statement.
   */
  describe("whatsapp_member_id is written outside the upsert", () => {
    it("keeps the member id out of the INSERT and its ON CONFLICT clause", async () => {
      const {database, statements} = recordingDatabase([[{id: "c-4"}], [{id: "c-4"}]]);
      const repository = createContactsRepository(async () => database);

      const result = await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-10T00:00:00Z"),
        whatsappMemberId: "member-9001",
      });

      expect(result).toEqual({id: "c-4", disposition: "upserted", memberIdLink: "linked"});
      const upsert = normalized(statements[0]?.sql);
      expect(upsert).toMatch(/^insert into "contacts"/);
      expect(upsert).not.toContain("whatsapp_member_id");
      const link = normalized(statements[1]?.sql);
      expect(link).toMatch(/^update "contacts"/);
      expect(link).toContain(`"contacts"."whatsapp_member_id" is null`);
      expect(link).toContain("not exists (");
      expect(statements[1]?.params).toEqual(expect.arrayContaining(["member-9001", "c-4"]));
    });

    it("reports a conflict instead of throwing, because a 500 here is an infinite Woztell retry", async () => {
      const {database} = recordingDatabase([[{id: "c-5"}], duplicateKeyError()]);
      const repository = createContactsRepository(async () => database);

      await expect(repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-10T00:00:00Z"),
        whatsappMemberId: "member-9001",
      })).resolves.toEqual({id: "c-5", disposition: "upserted", memberIdLink: "conflict"});
    });

    it("still surfaces a failure that is not the member-id race", async () => {
      const {database} = recordingDatabase([
        [{id: "c-6"}],
        Object.assign(new Error("connection terminated"), {code: "57P01"}),
      ]);
      const repository = createContactsRepository(async () => database);

      await expect(repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-10T00:00:00Z"),
        whatsappMemberId: "member-9001",
      })).rejects.toThrow("connection terminated");
    });

    it("runs one statement when the payload carries no member id", async () => {
      const {database, statements} = recordingDatabase([[{id: "c-7"}]]);
      const repository = createContactsRepository(async () => database);

      await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-10T00:00:00Z"),
      });

      expect(statements).toHaveLength(1);
    });
  });

  /**
   * C-1 Task 5. The withdrawal is a guarded UPDATE and the
   * `consent.whatsapp.revoked` audit row in one transaction. Two statements
   * here and not three: this fake answers every statement with a row, so the
   * guarded revoke "matches" and the timestamp stamp it would otherwise fall
   * through to is skipped. `tests/unit/contacts-consent-audit.test.ts` owns the
   * behaviour; this case only keeps the happy path and the return honest.
   */
  it("marks a phone opted out and reports that it revoked something", async () => {
    const {database, execute} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.markWhatsAppOptedOut(contactWriterActor("whatsapp"), "+85291234567")).resolves.toBe("revoked");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
