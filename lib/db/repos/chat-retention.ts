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
  return sql.raw('"conversation"."agent_kind" = \'concierge\'');
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
