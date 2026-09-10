import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";

const dialect = new PgDialect();

type Statement = Readonly<{sql: string; params: readonly unknown[]}>;

/**
 * Phase C1 Task 5. `markWhatsAppOptedOut` now writes inside a transaction, so
 * the fake has to be one: `tests/unit/contacts-repository.test.ts`'s
 * `recordingDatabase` records statements but has no `transaction`, and a
 * consent row that commits separately from the flag it audits is precisely the
 * failure boundary 11 exists to prevent. Statements are recorded in order and
 * tagged with the transaction they ran in, so "the same transaction" is an
 * assertion rather than a hope.
 */
function transactionalRecorder(responses: readonly Record<string, unknown>[][]) {
  const statements: Statement[] = [];
  const transactionOf: number[] = [];
  const queue = [...responses];
  let transactions = 0;
  let current = 0;
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    statements.push({sql: compiled.sql, params: compiled.params});
    transactionOf.push(current);
    return queue.shift() ?? [];
  });
  const database = {
    execute,
    async transaction<T>(work: (transaction: {execute: typeof execute}) => Promise<T>): Promise<T> {
      transactions += 1;
      current = transactions;
      const result = await work({execute});
      current = 0;
      return result;
    },
  };
  return {
    statements,
    transactionOf,
    execute,
    database: database as never,
    transactionCount: () => transactions,
  };
}

/**
 * `--` comments are house style inside these templates (see
 * `lib/db/repos/agent-runs.ts`), and they run to the end of a LINE. Strip them
 * before collapsing whitespace, or the collapse would splice a comment across
 * the rest of the statement and every assertion below would read the wrong text.
 */
function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function auditStatements(statements: readonly Statement[]): readonly Statement[] {
  return statements.filter((statement) => normalized(statement.sql).startsWith(`insert into "audit_events"`));
}

const stopActor = contactWriterActor("whatsapp");
const phone = "+85291234567";

describe("contact consent withdrawal is audited (D-7, boundary 11)", () => {
  it("flips the flag and writes consent.whatsapp.revoked in one transaction", async () => {
    // The timestamp back-fill returns nothing, then the guarded UPDATE matches.
    const recorder = transactionalRecorder([[], [{id: "c-1"}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("revoked");

    expect(recorder.transactionCount()).toBe(1);
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
    const audits = auditStatements(recorder.statements);
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    // The action and the target type are inline literals, not bind parameters:
    // they are facts about this call site, not values it was handed.
    expect(normalized(audit?.sql)).toContain("'consent.whatsapp.revoked'");
    expect(normalized(audit?.sql)).toContain("'contact'");
    expect(audit?.params).toEqual(expect.arrayContaining(["contact-writer", "c-1"]));
    const metadata = (audit?.params ?? []).find((value) => typeof value === "string" && value.includes("whatsapp_stop"));
    expect(JSON.parse(String(metadata))).toEqual({source: "whatsapp", reasonCode: "whatsapp_stop"});
  });

  it("guards the flag update so a webhook retry writes no second audit row", async () => {
    // The route 500s on a throw, so Woztell retries are routine: the second
    // delivery of the same STOP must be a no-op, not a second consent record.
    const recorder = transactionalRecorder([[], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("already_revoked");

    expect(auditStatements(recorder.statements)).toHaveLength(0);
    const guarded = recorder.statements.map((statement) => normalized(statement.sql)).find((text) => text.includes(`"whatsapp_opt_in" = true`));
    expect(guarded).toBeDefined();
  });

  it("stamps whatsapp_opted_out_at for a contact whose flag was already false, without auditing it", async () => {
    // A prospect never opted in (contacts.whatsapp_opt_in defaults to false) but
    // has now said STOP. The withdrawal timestamp is what the interest-form
    // revival guard reads, so it has to be written even though the guarded
    // UPDATE matches nothing — and it is not a new withdrawal to audit.
    const recorder = transactionalRecorder([[{id: "c-2"}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("already_revoked");

    const backfill = normalized(recorder.statements[0]?.sql);
    expect(backfill).toMatch(/^update "contacts"/);
    expect(backfill).toContain(`"whatsapp_opted_out_at" is null`);
    expect(backfill).not.toContain(`"whatsapp_opt_in" = true`);
    expect(auditStatements(recorder.statements)).toHaveLength(0);
  });

  it("still refuses an actor without the contact-writer capability, before any statement", async () => {
    const recorder = transactionalRecorder([]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut({kind: "staff", userId: "s", profileId: "s"}, phone)).rejects.toThrow("FORBIDDEN");
    await expect(repository.markWhatsAppOptedOut({kind: "contact-writer", userId: null, source: "whatsapp"}, phone)).rejects.toThrow("FORBIDDEN");
    expect(recorder.execute).not.toHaveBeenCalled();
  });

  it("validates the number before opening the database", async () => {
    const loadDatabase = vi.fn();
    const repository = createContactsRepository(loadDatabase as never);

    await expect(repository.markWhatsAppOptedOut(stopActor, "not-a-number")).rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});

/**
 * The merge in `upsertFromInterestForm` used to be
 * `whatsapp_opt_in = EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in`, so a
 * later interest form or guest RSVP silently re-opted-in somebody who had sent
 * STOP. There is no Postgres in this worktree to evaluate the replacement, so
 * the guard is read back out of the emitted statement and applied to stored
 * rows — the shape `tests/unit/repository-production-security.test.ts`'s
 * `demotionGate` uses, and for the same reason: a compliant and a
 * non-compliant merge build statements that differ only in this expression.
 */
function optInMerge(statement: string | undefined): (stored: {optedOutAt: string | null; optIn: boolean}, incoming: boolean) => boolean {
  const clause = normalized(statement);
  const merge = /whatsapp_opt_in = case when "contacts"\."whatsapp_opted_out_at" is not null then false else excluded\.whatsapp_opt_in or "contacts"\."whatsapp_opt_in" end/.exec(clause);
  if (!merge) throw new Error(`opt-in merge did not match the expected grammar: ${clause}`);
  return (stored, incoming) => (stored.optedOutAt !== null ? false : incoming || stored.optIn);
}

describe("an interest form cannot revive a WhatsApp opt-out", () => {
  it("consults whatsapp_opted_out_at in the opt-in merge", async () => {
    const recorder = transactionalRecorder([[{id: "c-3"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "en",
      whatsappNumber: phone,
      whatsappOptIn: true,
    });

    const merge = optInMerge(recorder.statements[0]?.sql);
    expect(merge({optedOutAt: "2026-09-01T00:00:00Z", optIn: false}, true)).toBe(false);
    expect(merge({optedOutAt: "2026-09-01T00:00:00Z", optIn: true}, true)).toBe(false);
    expect(merge({optedOutAt: null, optIn: false}, true)).toBe(true);
    expect(merge({optedOutAt: null, optIn: true}, false)).toBe(true);
    expect(merge({optedOutAt: null, optIn: false}, false)).toBe(false);
  });

  it.each([
    ["interest_form", "interest_form"],
    ["event_guest", "rsvp"],
  ] as const)("keeps the guard for the %s writer", async (source, consentSource) => {
    const recorder = transactionalRecorder([[{id: "c-4"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor(source), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "zh-HK",
      whatsappNumber: phone,
      whatsappOptIn: true,
      consentSource,
    });

    expect(normalized(recorder.statements[0]?.sql)).toContain(`"contacts"."whatsapp_opted_out_at" is not null`);
  });
});
