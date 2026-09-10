import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {createSuppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";

const dialect = new PgDialect();

type Statement = Readonly<{sql: string; params: readonly unknown[]}>;

/**
 * The same recorder shape as `tests/unit/contacts-consent-audit.test.ts`: the
 * statements are recorded in order with their compiled SQL, because "which
 * statement decided to audit" is the whole subject of this file and a bare
 * call count cannot tell those cases apart.
 */
function transactionalRecorder(responses: readonly Record<string, unknown>[][]) {
  const statements: Statement[] = [];
  const queue = [...responses];
  let transactions = 0;
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    statements.push({sql: compiled.sql, params: compiled.params});
    return queue.shift() ?? [];
  });
  const database = {
    execute,
    async transaction<T>(work: (transaction: {execute: typeof execute}) => Promise<T>): Promise<T> {
      transactions += 1;
      return await work({execute});
    },
  };
  return {statements, execute, database: database as never, transactionCount: () => transactions};
}

/** `--` comments run to the end of a line; strip them before collapsing. */
function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function auditStatements(statements: readonly Statement[]): readonly Statement[] {
  return statements.filter((statement) => normalized(statement.sql).startsWith(`insert into "audit_events"`));
}

function auditMetadata(statement: Statement | undefined): unknown {
  const raw = (statement?.params ?? []).find((value) => typeof value === "string" && value.includes("reasonCode"));
  return JSON.parse(String(raw));
}

describe("suppressionsRepository.optOutWhatsApp", () => {
  it("clears the profile flag, inserts the whatsapp suppression and an audit row in one transaction", async () => {
    const recorder = transactionalRecorder([[{id: "profile-1"}], [{id: "suppression-1"}], []]);
    const repository = createSuppressionsRepository(async () => recorder.database);

    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("created");

    expect(recorder.statements).toHaveLength(3);
    expect(recorder.transactionCount()).toBe(1);
    const audits = auditStatements(recorder.statements);
    expect(audits).toHaveLength(1);
    expect(normalized(audits[0]?.sql)).toContain("'consent.whatsapp.revoked'");
    expect(auditMetadata(audits[0])).toEqual({
      reasonCode: "whatsapp_stop",
      clearedOptIn: true,
      suppressionCreated: true,
    });
  });

  /**
   * C-1 review fix, round 2. The first fix made the audit row conditional on
   * the suppression INSERT alone, which regressed the case below: the member
   * re-granted WhatsApp from the portal, the suppression row was never deleted
   * (nothing in the tree deletes one outside the seeds), and their SECOND, real
   * withdrawal through `/api/unsubscribe?channel=whatsapp` cleared the flag and
   * wrote nothing anywhere — boundary 11 broken by the commit that fixed it on
   * the contact side. Either half being new is a consent change.
   */
  it("audits a second withdrawal that only the profile flag records", async () => {
    // The guarded UPDATE matches (the flag was true again after a re-consent);
    // the suppression from the first withdrawal is still there and conflicts.
    const recorder = transactionalRecorder([[{id: "profile-1"}], [], []]);
    const repository = createSuppressionsRepository(async () => recorder.database);

    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "member_unsubscribe")).resolves.toBe("created");

    const audits = auditStatements(recorder.statements);
    expect(audits).toHaveLength(1);
    expect(auditMetadata(audits[0])).toEqual({
      reasonCode: "member_unsubscribe",
      clearedOptIn: true,
      suppressionCreated: false,
    });
  });

  /**
   * The webhook leg clears `whatsapp_opt_in` at `woztell-webhook.ts` before
   * `recordOptOut` runs this method, so on that path the flag transition is
   * always already spent and the suppression INSERT is the only half that can
   * be new. This is the majority first-STOP shape for a member.
   */
  it("audits a first withdrawal that only the suppression records", async () => {
    const recorder = transactionalRecorder([[], [{id: "profile-1"}], [{id: "suppression-1"}], []]);
    const repository = createSuppressionsRepository(async () => recorder.database);

    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("created");

    expect(auditMetadata(auditStatements(recorder.statements)[0])).toEqual({
      reasonCode: "whatsapp_stop",
      clearedOptIn: false,
      suppressionCreated: true,
    });
  });

  /**
   * `recordOptOut` runs this leg and the contact leg in two transactions and
   * the webhook route 500s on a throw, so a failure in the second one has
   * Woztell redeliver the same STOP. Neither half is new on that redelivery —
   * the flag is already false and the suppression conflicts — so there is
   * nothing to record and a second `consent.whatsapp.revoked` row would be a
   * fiction.
   */
  it("writes no second audit row when neither the flag nor the suppression changed", async () => {
    const recorder = transactionalRecorder([[], [{id: "profile-1"}], []]);
    const repository = createSuppressionsRepository(async () => recorder.database);

    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("existing");

    expect(auditStatements(recorder.statements)).toHaveLength(0);
    expect(normalized(recorder.statements[0]?.sql)).toContain(`"whatsapp_opt_in" = true`);
  });

  /**
   * The guard costs the UPDATE its double duty as an existence check, and
   * `lib/api/unsubscribe-route.ts` turns PROFILE_NOT_FOUND into a 404 that a
   * forged-but-valid token relies on. The lookup that replaces it runs only
   * when the guard missed.
   */
  it("still raises PROFILE_NOT_FOUND for a profile that does not exist", async () => {
    const recorder = transactionalRecorder([[], []]);
    const repository = createSuppressionsRepository(async () => recorder.database);

    await expect(repository.optOutWhatsApp(unsubscribeActor(), "ghost", "member_unsubscribe")).rejects.toThrow("PROFILE_NOT_FOUND");

    expect(recorder.statements).toHaveLength(2);
    expect(auditStatements(recorder.statements)).toHaveLength(0);
    expect(recorder.statements.some((statement) => normalized(statement.sql).startsWith(`insert into "message_suppressions"`))).toBe(false);
  });

  it("refuses a member actor", async () => {
    const repository = createSuppressionsRepository(async () => ({execute: vi.fn(), transaction: vi.fn()}) as never);
    await expect(repository.optOutWhatsApp({kind: "member", userId: "u", profileId: "p"} as never, "p", "x")).rejects.toThrow();
  });
});
