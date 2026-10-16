import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {automationCronActor, requireAutomationSystem} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {agentRuns, conversations, messages} from "@/lib/db/server-schema";

const MAX_BATCH_SIZE = 1_000;

export type ChatRetentionInspection = Readonly<{
  messages: number;
  runsToRedact: number;
  runsToUnlink: number;
  emptyConversations: number;
}>;

export type EmptyConversationBatch = Readonly<{
  conversationsDeleted: number;
  runsUnlinked: number;
  runsRedacted: number;
}>;

export type ChatRetentionRepository = Readonly<{
  inspect(cutoff: Date, now: Date): Promise<ChatRetentionInspection>;
  redactRunsBatch(cutoff: Date, limit: number): Promise<number>;
  deleteMessagesBatch(cutoff: Date, limit: number): Promise<number>;
  removeEmptyConversationsBatch(
    now: Date,
    limit: number,
  ): Promise<EmptyConversationBatch>;
}>;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function limitFrom(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error("INVALID_RETENTION_CONFIGURATION");
  }
  return value;
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
  }
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return rowsFrom(result.rows);
  }
  return [];
}

function countFrom(row: Record<string, unknown> | undefined, key: string): number {
  const value = Number(row?.[key] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("INVALID_RETENTION_RESULT");
  }
  return value;
}

function idsFrom(result: unknown): string[] {
  return rowsFrom(result).map((row) => String(row.id));
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function conciergeConversationPredicate(): SQL {
  // Phase C1 S-10 narrowed this to bot-handled threads. A `messages` row used to
  // be a bot transcript artefact; once staff reply from /admin/inbox it is an
  // operational record with an audit_events row pointing at it, and this sweep
  // would delete a live staff↔member thread from the front on a rolling twelve
  // months — taking the delivery record, and the metadata.normalizedSender that
  // is the only cleartext copy of an anonymous sender's number, with it. The
  // retention rule for human-handled threads is a separate decision (O-5), not
  // an inheritance.
  return sql.raw(
    '"conversation"."agent_kind" = \'concierge\' AND "conversation"."handling" = \'bot\'',
  );
}

/**
 * The same exemption for the sites that spell their own
 * `agent_kind = 'concierge'` out rather than reaching for the helper above —
 * the three sub-selects of `inspect` and both halves of the empty-conversation
 * sweep. Unquoted to match the local style of those statements: the helper is
 * quoted,
 * and swapping it in there instead would silently retire the
 * `agent_kind = 'concierge'` assertions tests/unit/chat-retention.test.ts
 * anchors on the unquoted spelling — a passing test that had stopped testing
 * anything, which is the failure mode AGENTS.md calls out.
 */
function botHandledOnly(): SQL {
  return sql.raw("conversation.handling = 'bot'");
}

export function createChatRetentionRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
): ChatRetentionRepository {
  const actor = automationCronActor();

  async function database(): Promise<AutomationDatabase> {
    requireAutomationSystem(actor);
    return loadDatabase();
  }

  return {
    async inspect(cutoff, now) {
      if (!validDate(cutoff) || !validDate(now)) {
        throw new Error("INVALID_RETENTION_CLOCK");
      }
      const row = rowsFrom(await (await database()).execute(sql`
        WITH post_delete_empty_conversations AS (
          SELECT conversation.id
          FROM ${conversations} AS conversation
          WHERE conversation.agent_kind = 'concierge'
            -- S-10, and here for the same reason as in the batches below: a dry
            -- run that counts rows the sweep then refuses to touch reads as a
            -- stuck job rather than as a deliberate exemption. (Keep the wording
            -- clear of the two mutation verbs: tests/unit/chat-retention.test.ts
            -- proves this statement reads and never writes by asserting neither
            -- appears anywhere in it.)
            AND ${botHandledOnly()}
            AND conversation.expires_at <= ${now}
            AND NOT EXISTS (
              SELECT 1
              FROM ${messages} AS remaining
              WHERE remaining.conversation_id = conversation.id
                AND remaining.created_at >= ${cutoff}
            )
        )
        SELECT
          (
            SELECT count(*)::integer
            FROM ${messages} AS transcript
            INNER JOIN ${conversations} AS conversation
              ON conversation.id = transcript.conversation_id
            WHERE conversation.agent_kind = 'concierge'
              AND ${botHandledOnly()}
              AND transcript.created_at < ${cutoff}
          ) AS messages,
          (
            SELECT count(*)::integer
            FROM ${agentRuns} AS run
            INNER JOIN ${conversations} AS conversation
              ON conversation.id = run.conversation_id
            LEFT JOIN post_delete_empty_conversations AS candidate
              ON candidate.id = run.conversation_id
            WHERE conversation.agent_kind = 'concierge'
              AND ${botHandledOnly()}
              AND run.summary IS NOT NULL
              AND (
                run.created_at < ${cutoff}
                OR candidate.id IS NOT NULL
              )
          ) AS runs_to_redact,
          (
            SELECT count(*)::integer
            FROM ${agentRuns} AS run
            INNER JOIN post_delete_empty_conversations AS candidate
              ON candidate.id = run.conversation_id
          ) AS runs_to_unlink,
          (
            SELECT count(*)::integer
            FROM post_delete_empty_conversations
          ) AS empty_conversations
      `))[0];
      return {
        messages: countFrom(row, "messages"),
        runsToRedact: countFrom(row, "runs_to_redact"),
        runsToUnlink: countFrom(row, "runs_to_unlink"),
        emptyConversations: countFrom(row, "empty_conversations"),
      };
    },

    async redactRunsBatch(cutoff, limit) {
      if (!validDate(cutoff)) throw new Error("INVALID_RETENTION_CLOCK");
      const parsedLimit = limitFrom(limit);
      const result = await (await database()).execute(sql`
        WITH candidates AS (
          SELECT run.id
          FROM ${agentRuns} AS run
          INNER JOIN ${conversations} AS conversation
            ON conversation.id = run.conversation_id
          WHERE ${conciergeConversationPredicate()}
            AND run.created_at < ${cutoff}
            AND run.summary IS NOT NULL
          ORDER BY run.created_at, run.id
          LIMIT ${parsedLimit}
          FOR UPDATE OF run SKIP LOCKED
        )
        UPDATE ${agentRuns} AS run
        SET summary = NULL, updated_at = now()
        FROM candidates
        WHERE run.id = candidates.id
        RETURNING run.id
      `);
      return rowsFrom(result).length;
    },

    async deleteMessagesBatch(cutoff, limit) {
      if (!validDate(cutoff)) throw new Error("INVALID_RETENTION_CLOCK");
      const parsedLimit = limitFrom(limit);
      const result = await (await database()).execute(sql`
        WITH candidates AS (
          SELECT transcript.id
          FROM ${messages} AS transcript
          INNER JOIN ${conversations} AS conversation
            ON conversation.id = transcript.conversation_id
          WHERE ${conciergeConversationPredicate()}
            AND transcript.created_at < ${cutoff}
          ORDER BY transcript.created_at, transcript.id
          LIMIT ${parsedLimit}
          FOR UPDATE OF transcript SKIP LOCKED
        )
        DELETE FROM ${messages} AS transcript
        USING candidates
        WHERE transcript.id = candidates.id
        RETURNING transcript.id
      `);
      return rowsFrom(result).length;
    },

    async removeEmptyConversationsBatch(now, limit) {
      if (!validDate(now)) throw new Error("INVALID_RETENTION_CLOCK");
      const parsedLimit = limitFrom(limit);
      const db = await database();
      return db.transaction(async (transaction: AutomationSqlExecutor) => {
        const ids = idsFrom(await transaction.execute(sql`
          SELECT conversation.id
          FROM ${conversations} AS conversation
          WHERE conversation.agent_kind = 'concierge'
            -- S-10. A human-handled thread with no messages left is still the
            -- row an audit_events entry and an assignment point at; deleting it
            -- here would orphan both.
            AND ${botHandledOnly()}
            AND conversation.expires_at <= ${now}
            AND NOT EXISTS (
              SELECT 1
              FROM ${messages} AS transcript
              WHERE transcript.conversation_id = conversation.id
            )
          ORDER BY conversation.expires_at, conversation.id
          LIMIT ${parsedLimit}
          FOR UPDATE OF conversation SKIP LOCKED
        `));
        if (ids.length === 0) {
          return {
            conversationsDeleted: 0,
            runsUnlinked: 0,
            runsRedacted: 0,
          };
        }

        const runsRedacted = rowsFrom(await transaction.execute(sql`
          UPDATE ${agentRuns} AS run
          SET summary = NULL, updated_at = now()
          WHERE run.conversation_id = ANY(${ids}::uuid[])
            AND run.summary IS NOT NULL
          RETURNING run.id
        `)).length;
        const runsUnlinked = rowsFrom(await transaction.execute(sql`
          UPDATE ${agentRuns} AS run
          SET conversation_id = NULL, updated_at = now()
          WHERE run.conversation_id = ANY(${ids}::uuid[])
          RETURNING run.id
        `)).length;
        const conversationsDeleted = rowsFrom(await transaction.execute(sql`
          DELETE FROM ${conversations} AS conversation
          WHERE conversation.id = ANY(${ids}::uuid[])
            AND conversation.agent_kind = 'concierge'
            -- Re-checked at the DELETE, not merely at the candidate SELECT: the
            -- rows were chosen FOR UPDATE SKIP LOCKED in the same transaction,
            -- but this statement is the one that destroys them and every other
            -- predicate is repeated here for the same reason (S-10).
            AND ${botHandledOnly()}
            AND NOT EXISTS (
              SELECT 1
              FROM ${messages} AS transcript
              WHERE transcript.conversation_id = conversation.id
            )
          RETURNING conversation.id
        `)).length;

        return {
          conversationsDeleted,
          runsUnlinked,
          runsRedacted,
        };
      });
    },
  };
}

export const chatRetentionRepository = createChatRetentionRepository();
