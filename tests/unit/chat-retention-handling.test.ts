import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createChatRetentionRepository} from "@/lib/db/repos/chat-retention";
import {createConversationsRepository} from "@/lib/db/repos/conversations";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";

/**
 * Phase C1 S-10. Both sweeps used to delete a conversation on age alone. Once
 * staff reply from /admin/inbox the thread is an operational record with an
 * `audit_events` row pointing at it, and the twelve-month sweep would delete it
 * from the front — taking the delivery record, and the
 * `metadata.normalizedSender` that is the only cleartext copy of an anonymous
 * sender's number, with it. Every statement that chooses rows to destroy must
 * therefore restrict itself to `handling = 'bot'`.
 *
 * There is no local database in this worktree, so no test here can watch a real
 * row survive a real DELETE; the evidence available is the statement the
 * repository emits. `admitsHandling` below turns that statement into the
 * question that matters — "could a row with this handling be chosen?" — rather
 * than grepping for a spelling, and has its own hostile/safe samples so it can
 * be shown to still catch a violation (AGENTS.md). The end-to-end proof stays an
 * owner action against an isolated Neon branch.
 */

const HANDLING_PREDICATE =
  /\b(?:AND|WHERE)\s+"?(?:\w+"?\."?)?handling"?\s*=\s*'(bot|human|closed)'/gi;

/**
 * True when a conversation in `handling` could be selected by `statement`.
 * Only equality conjuncts on `handling` are read: a statement carrying none
 * admits every handling, which is precisely the pre-S-10 behaviour this file
 * exists to refuse. A `SET handling = …` is not a filter and is deliberately not
 * matched — the leading `AND`/`WHERE` is what makes it a predicate.
 */
function admitsHandling(statement: string, handling: "bot" | "human" | "closed"): boolean {
  const required = [...statement.matchAll(HANDLING_PREDICATE)].map(([, value]) => value);
  if (required.length === 0) return true;
  return required.every((value) => value === handling);
}

type Capture = Readonly<{database: AutomationDatabase; statements: string[]}>;

/**
 * The pg-proxy driver of tests/unit/repository-exists-scope-sql.test.ts, with
 * the same pass-through `transaction` (pg-proxy throws on a real one) and a
 * queue of row batches so `removeEmptyConversationsBatch` gets past its
 * candidate SELECT and reaches its DELETE.
 */
function capture(results: readonly Record<string, unknown>[][] = []): Capture {
  const statements: string[] = [];
  const pending = results.map((rows) => [...rows]);
  const proxy = drizzle(async (query: string) => {
    statements.push(query);
    return {rows: pending.shift() ?? []};
  });
  const database = {
    execute: (query: Parameters<AutomationDatabase["execute"]>[0]) => proxy.execute(query),
    transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
  } as AutomationDatabase;
  return {database, statements};
}

const cutoff = new Date("2025-09-10T00:00:00.000Z");
const now = new Date("2026-09-10T00:00:00.000Z");
const conversationId = "11111111-1111-4111-8111-111111111111";

async function emittedStatements(): Promise<Readonly<Record<string, readonly string[]>>> {
  const expiry = capture([[{id: conversationId}]]);
  await createConversationsRepository(async () => expiry.database)
    .deleteExpired(automationCronActor(), {asOf: now, limit: 25});

  const redact = capture([[{id: "run-1"}]]);
  await createChatRetentionRepository(async () => redact.database)
    .redactRunsBatch(cutoff, 25);

  const transcripts = capture([[{id: "message-1"}]]);
  await createChatRetentionRepository(async () => transcripts.database)
    .deleteMessagesBatch(cutoff, 25);

  const empties = capture([
    [{id: conversationId}],
    [{id: "run-1"}],
    [{id: "run-1"}],
    [{id: conversationId}],
  ]);
  await createChatRetentionRepository(async () => empties.database)
    .removeEmptyConversationsBatch(now, 25);

  const inspection = capture([[{
    messages: 0,
    runs_to_redact: 0,
    runs_to_unlink: 0,
    empty_conversations: 0,
  }]]);
  await createChatRetentionRepository(async () => inspection.database)
    .inspect(cutoff, now);

  return {
    deleteExpired: expiry.statements,
    redactRunsBatch: redact.statements,
    deleteMessagesBatch: transcripts.statements,
    removeEmptyConversationsBatch: empties.statements,
    inspect: inspection.statements,
  };
}

describe("retention sweeps leave human-handled threads alone (S-10)", () => {
  it("restricts every destructive statement to handling = 'bot'", async () => {
    const emitted = await emittedStatements();

    // A broken walk must not pass vacuously: each of these emits at least one
    // statement, and the empty-conversation sweep emits its DELETE only because
    // the fixture hands its candidate SELECT a row.
    expect(emitted.deleteExpired).toHaveLength(1);
    expect(emitted.redactRunsBatch).toHaveLength(1);
    expect(emitted.deleteMessagesBatch).toHaveLength(1);
    expect(emitted.removeEmptyConversationsBatch).toHaveLength(4);

    const destructive = [
      ["conversations.deleteExpired", emitted.deleteExpired[0]],
      ["chatRetention.redactRunsBatch", emitted.redactRunsBatch[0]],
      ["chatRetention.deleteMessagesBatch", emitted.deleteMessagesBatch[0]],
      // The candidate SELECT and the DELETE it feeds. The two agent_runs
      // UPDATEs between them key off ids this pair already filtered.
      ["chatRetention.removeEmptyConversationsBatch candidates", emitted.removeEmptyConversationsBatch[0]],
      ["chatRetention.removeEmptyConversationsBatch delete", emitted.removeEmptyConversationsBatch[3]],
    ] as const;

    for (const [name, statement] of destructive) {
      expect(statement, name).toMatch(/handling/i);
      expect(statement, name).toMatch(/'bot'/);
      expect(admitsHandling(statement ?? "", "bot"), name).toBe(true);
      expect(admitsHandling(statement ?? "", "human"), name).toBe(false);
      expect(admitsHandling(statement ?? "", "closed"), name).toBe(false);
    }
  });

  it("keeps the dry run honest by counting what the sweep would actually delete", async () => {
    const emitted = await emittedStatements();
    const statement = emitted.inspect[0] ?? "";

    // `inspect` is what a dry run reports. Left un-narrowed it would promise a
    // backlog the sweep then refuses to touch, and the difference would read as
    // a stuck job rather than as a deliberate exemption.
    expect(statement).toMatch(/handling/i);
    expect(admitsHandling(statement, "bot")).toBe(true);
    expect(admitsHandling(statement, "human")).toBe(false);
  });

  it("detects the shapes it is meant to catch", () => {
    const unfiltered = 'DELETE FROM "conversations" WHERE "expires_at" <= $1';
    expect(admitsHandling(unfiltered, "human")).toBe(true);

    const inverted = 'DELETE FROM "conversations" WHERE "handling" = \'human\'';
    expect(admitsHandling(inverted, "bot")).toBe(false);

    // A write is not a filter, and neither is a negation or a projection.
    for (const decoy of [
      'UPDATE "conversations" SET "handling" = \'bot\' WHERE id = $1',
      'DELETE FROM "conversations" WHERE "handling" <> \'bot\'',
      'DELETE FROM "conversations" WHERE id = $1 RETURNING "handling", \'bot\'',
    ]) {
      expect(admitsHandling(decoy, "human"), decoy).toBe(true);
    }

    for (const guarded of [
      'DELETE FROM "conversations" WHERE "handling" = \'bot\'',
      'SELECT id FROM "conversations" WHERE expires_at <= $1 AND "conversations"."handling" = \'bot\'',
      "SELECT id FROM conversations AS conversation WHERE conversation.handling = 'bot'",
    ]) {
      expect(admitsHandling(guarded, "bot"), guarded).toBe(true);
      expect(admitsHandling(guarded, "human"), guarded).toBe(false);
    }
  });
});
