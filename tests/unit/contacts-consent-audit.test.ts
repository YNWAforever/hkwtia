import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

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

/**
 * C2 Task 3 put a `SELECT … FOR UPDATE` in front of the upsert, so the upsert
 * is no longer statement 0 on an opting-in submission. Find it by its shape
 * rather than by index: these cases are about the merge expression, and an
 * index that silently pointed at the lock read would assert nothing.
 */
function upsertStatement(statements: readonly Statement[]): Statement | undefined {
  return statements.find((statement) => normalized(statement.sql).startsWith(`insert into "contacts"`));
}

const stopActor = contactWriterActor("whatsapp");
const phone = "+85291234567";

describe("contact consent withdrawal is audited (D-7, boundary 11)", () => {
  it("flips the flag and writes consent.whatsapp.revoked in one transaction", async () => {
    // The guarded revoke matches, so the timestamp stamp is never run.
    const recorder = transactionalRecorder([[{id: "c-1"}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("revoked");

    expect(recorder.statements).toHaveLength(2);
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
    expect(JSON.parse(String(metadata))).toEqual({source: "whatsapp", reasonCode: "whatsapp_stop", clearedMarketingOptIn: true});
  });

  it("guards both statements so a webhook retry writes no second audit row", async () => {
    // The route 500s on a throw, so Woztell retries are routine: the second
    // delivery of the same STOP must be a no-op, not a second consent record.
    // Both guards miss — the flag is already false and the timestamp is set.
    const recorder = transactionalRecorder([[], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("already_revoked");

    expect(auditStatements(recorder.statements)).toHaveLength(0);
    const texts = recorder.statements.map((statement) => normalized(statement.sql));
    expect(texts.find((text) => text.includes(`"whatsapp_opt_in" = true`))).toBeDefined();
    expect(texts.find((text) => text.includes(`"whatsapp_opted_out_at" is null`))).toBeDefined();
  });

  it("audits the withdrawal of a contact whose marketing flag was never true", async () => {
    // The majority prospect shape: contacts.whatsapp_opt_in defaults to false
    // and upsertFromWhatsApp never sets it, so the guarded revoke matches
    // nothing and the timestamp stamp is the ONLY record of the STOP. It is
    // still a consent change — messageEligibility answers blocked/opted_out for
    // both purposes afterwards, and the interest form can no longer revive the
    // number — so it is audited, and the metadata says the grant was never
    // there. The plan's Step 3 said not to audit this; that was the defect.
    const recorder = transactionalRecorder([[], [{id: "c-2"}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.markWhatsAppOptedOut(stopActor, phone)).resolves.toBe("revoked");

    const stamp = normalized(recorder.statements[1]?.sql);
    expect(stamp).toMatch(/^update "contacts"/);
    expect(stamp).toContain(`"whatsapp_opted_out_at" is null`);
    expect(stamp).not.toContain(`"whatsapp_opt_in" = true`);
    const audits = auditStatements(recorder.statements);
    expect(audits).toHaveLength(1);
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
    expect(audits[0]?.params).toEqual(expect.arrayContaining(["c-2"]));
    const metadata = (audits[0]?.params ?? []).find((value) => typeof value === "string" && value.includes("whatsapp_stop"));
    expect(JSON.parse(String(metadata))).toEqual({source: "whatsapp", reasonCode: "whatsapp_stop", clearedMarketingOptIn: false});
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
    // [lock read, upsert]: the lock read answers "no prior row".
    const recorder = transactionalRecorder([[], [{id: "c-3"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "en",
      whatsappNumber: phone,
      whatsappOptIn: true,
    });

    const merge = optInMerge(upsertStatement(recorder.statements)?.sql);
    expect(merge({optedOutAt: "2026-09-01T00:00:00Z", optIn: false}, true)).toBe(false);
    expect(merge({optedOutAt: "2026-09-01T00:00:00Z", optIn: true}, true)).toBe(false);
    expect(merge({optedOutAt: null, optIn: false}, true)).toBe(true);
    expect(merge({optedOutAt: null, optIn: true}, false)).toBe(true);
    expect(merge({optedOutAt: null, optIn: false}, false)).toBe(false);
  });

  /**
   * The flag is only half the row. Refreshing the consent EVIDENCE columns on a
   * submission the CASE above forces to false leaves `whatsapp_consent_at`
   * NEWER than the `whatsapp_opted_out_at` that beat it — the state C-4's
   * re-consent flow (O-4) will read to decide whether this person came back,
   * and it would read it as a yes.
   */
  it("freezes the consent evidence columns on a withdrawn row", async () => {
    const recorder = transactionalRecorder([[], [{id: "c-5"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "en",
      whatsappNumber: phone,
      whatsappOptIn: true,
    });

    const clause = normalized(upsertStatement(recorder.statements)?.sql);
    for (const column of ["whatsapp_consent_at", "whatsapp_consent_source", "whatsapp_consent_text_version"]) {
      expect(clause).toContain(
        `${column} = case when "contacts"."whatsapp_opted_out_at" is not null then "contacts"."${column}"`
        + ` else coalesce(excluded.${column}, "contacts"."${column}") end`,
      );
    }
  });

  it.each([
    ["interest_form", "interest_form"],
    ["event_guest", "rsvp"],
  ] as const)("keeps the guard for the %s writer", async (source, consentSource) => {
    const recorder = transactionalRecorder([[], [{id: "c-4"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor(source), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "zh-HK",
      whatsappNumber: phone,
      whatsappOptIn: true,
      consentSource,
    });

    expect(normalized(upsertStatement(recorder.statements)?.sql)).toContain(`"contacts"."whatsapp_opted_out_at" is not null`);
  });
});

/**
 * C2 Task 3. The other half of C1's withdrawal leg, and boundary 11's remaining
 * gap on the prospect side: a GRANT is a consent change, and the contact lane
 * had no audit row for one. `consent.whatsapp.granted` already existed for
 * PROFILES (`lib/db/repos/profiles.ts`, Phase A) — the plan's claim that a
 * repo-wide grep returned zero hits was stale — so the shape here deliberately
 * matches that one: a TRANSITION, audited in the same transaction as the write,
 * never the posted value.
 *
 * The prior value is taken by `SELECT … FOR UPDATE` before the upsert, not out
 * of the upsert's own `RETURNING`. `profilesRepository.update` records why: a
 * self-join or CTE reading the old row inside the writing statement reads that
 * statement's pre-lock snapshot, so two concurrent submissions for one number
 * would both see `false` and both audit.
 */
describe("a newly granted contact opt-in is audited (C-8, boundary 11)", () => {
  const granted = (statements: readonly Statement[]) =>
    auditStatements(statements).filter((statement) => normalized(statement.sql).includes("'consent.whatsapp.granted'"));

  async function submit(
    recorder: ReturnType<typeof transactionalRecorder>,
    overrides: Readonly<Record<string, unknown>> = {},
  ) {
    const repository = createContactsRepository(async () => recorder.database);
    return repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "en",
      whatsappNumber: phone,
      whatsappOptIn: true,
      ...overrides,
    });
  }

  it("takes the row lock before the upsert and audits the grant in the same transaction", async () => {
    // [lock read: no prior row, upsert: now opted in, audit]
    const recorder = transactionalRecorder([[], [{id: "c-10", whatsapp_opt_in: true}], []]);

    await expect(submit(recorder)).resolves.toEqual({id: "c-10", disposition: "upserted"});

    const lock = normalized(recorder.statements[0]?.sql);
    expect(lock).toMatch(/^select /);
    expect(lock).toContain("for update");
    expect(normalized(recorder.statements[1]?.sql)).toMatch(/^insert into "contacts"/);
    const rows = granted(recorder.statements);
    expect(rows).toHaveLength(1);
    // The action and the target type are inline literals, not bind parameters:
    // they are facts about this call site, not values it was handed.
    expect(normalized(rows[0]?.sql)).toContain("'contact'");
    expect(rows[0]?.params).toEqual(expect.arrayContaining(["contact-writer", "c-10"]));
    const metadata = (rows[0]?.params ?? []).find((value) => typeof value === "string" && value.includes("consentSource"));
    expect(JSON.parse(String(metadata))).toEqual({
      source: "interest_form",
      consentSource: "interest_form",
      consentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
    });
    expect(recorder.transactionCount()).toBe(1);
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
  });

  it("writes nothing when the contact was already opted in", async () => {
    // The repeat submission that refreshes a consent already held. A trail that
    // records every form post says nothing about when consent actually changed.
    const recorder = transactionalRecorder([[{whatsapp_opt_in: true}], [{id: "c-11", whatsapp_opt_in: true}]]);

    await expect(submit(recorder)).resolves.toEqual({id: "c-11", disposition: "upserted"});

    expect(granted(recorder.statements)).toHaveLength(0);
    expect(recorder.statements).toHaveLength(2);
  });

  /**
   * The revival guard and the audit row have to agree. C1's merge forces
   * `whatsapp_opt_in = false` on a row carrying `whatsapp_opted_out_at`, so the
   * submission grants nothing — and a `consent.whatsapp.granted` row written
   * from the INPUT rather than the RESULT would be a consent record for consent
   * we refused to accept, on exactly the person who had sent STOP.
   */
  it("writes nothing when the revival guard refused the grant", async () => {
    const recorder = transactionalRecorder([[{whatsapp_opt_in: false}], [{id: "c-12", whatsapp_opt_in: false}]]);

    await expect(submit(recorder)).resolves.toEqual({id: "c-12", disposition: "upserted"});

    expect(granted(recorder.statements)).toHaveLength(0);
  });

  it("does not take the lock at all when the submission is not opting in", async () => {
    // `EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in` with `false` on the
    // left can only preserve what is there, so there is no transition to miss —
    // and the common path keeps its single statement.
    const recorder = transactionalRecorder([[{id: "c-13", whatsapp_opt_in: false}]]);

    await expect(submit(recorder, {whatsappOptIn: false, whatsappNumber: null}))
      .resolves.toEqual({id: "c-13", disposition: "upserted"});

    expect(recorder.statements).toHaveLength(1);
    expect(normalized(recorder.statements[0]?.sql)).toMatch(/^insert into "contacts"/);
  });

  /**
   * The C2 review defect, and the reason the case above is not enough on its own:
   * that one passes `whatsappNumber: null`, so the upsert can only INSERT a fresh
   * row. The dangerous shape is a DECLINING submission that still carries a number
   * an opted-in contact already holds. The lock read is skipped, so `priorOptIn` is
   * a hard-coded `false`; the merge evaluates `false OR true` = true; and
   * `RETURNING` reports that POST-update `true`. Reading those two together as a
   * transition wrote one `consent.whatsapp.granted` row per submission, attributed
   * to a form on which the person had declined.
   *
   * Both writers reach it. `lib/events/guest-registration-core.ts` posts
   * `whatsappOptIn: marketingConsent && whatsappNumber !== null` — an unchecked box
   * with a number filled in — and `lib/growth/interest-service.ts` rejects only
   * opt-in WITHOUT a number, so number-present/opt-in-false is a valid submission
   * there too.
   */
  it("writes nothing when a declining submission carries a number already opted in", async () => {
    const recorder = transactionalRecorder([[{id: "c-15", whatsapp_opt_in: true}]]);

    await expect(submit(recorder, {whatsappOptIn: false}))
      .resolves.toEqual({id: "c-15", disposition: "upserted"});

    expect(granted(recorder.statements)).toHaveLength(0);
    // Still the single-statement path: the fix is in the condition that consumes
    // the skipped read, not in reinstating the read. Reinstating it would put a
    // row lock on the common declining submission for an audit row that, by
    // definition, cannot be owed — this form asserted no consent.
    expect(recorder.statements).toHaveLength(1);
    expect(normalized(recorder.statements[0]?.sql)).toMatch(/^insert into "contacts"/);
  });

  it("audits a first grant from the guest RSVP with that form's consent source", async () => {
    const recorder = transactionalRecorder([[], [{id: "c-14", whatsapp_opt_in: true}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await repository.upsertFromInterestForm(contactWriterActor("event_guest"), {
      email: "ada@example.hk",
      displayName: "Ada",
      locale: "zh-HK",
      whatsappNumber: phone,
      whatsappOptIn: true,
      consentSource: "rsvp",
    });

    const rows = granted(recorder.statements);
    expect(rows).toHaveLength(1);
    const metadata = (rows[0]?.params ?? []).find((value) => typeof value === "string" && value.includes("consentSource"));
    expect(JSON.parse(String(metadata))).toEqual({
      source: "event_guest",
      consentSource: "rsvp",
      consentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
    });
  });
});
