import "server-only";

import {sql} from "drizzle-orm";

import {
  decideWoztellRunRecovery,
  type WoztellRunRecovery,
} from "@/lib/ai/woztell-run-recovery";
import {getDb} from "@/lib/db/repos/common";
import {providerRunId} from "@/lib/db/repos/woztell";
import {agentRuns, messages} from "@/lib/db/server-schema";

type RecoverySqlExecutor = Readonly<{
  execute(query: unknown): Promise<unknown>;
}>;

export type WoztellRecoveryDatabaseLoader =
  () => Promise<RecoverySqlExecutor>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<RecoverySqlExecutor> {
  return await getDb() as unknown as RecoverySqlExecutor;
}

export function createWoztellRunRecoveryRepository(
  loadDatabase: WoztellRecoveryDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async recoverRun(
      providerMessageId: string,
      conversationId: string,
    ): Promise<WoztellRunRecovery> {
      const runId = providerRunId(providerMessageId);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT
          ${agentRuns.status} AS status,
          ${agentRuns.provider} AS provider,
          ${agentRuns.model} AS model,
          (
            SELECT ${messages.content}
            FROM ${messages}
            WHERE ${messages.conversationId} = ${conversationId}
              AND ${messages.role} = 'assistant'
              AND ${messages.channel} = 'whatsapp'
              AND ${messages.metadata}->>'woztellRunId' = ${runId}
            ORDER BY ${messages.createdAt} DESC, ${messages.id} DESC
            LIMIT 1
          ) AS assistant_reply
        FROM ${agentRuns}
        WHERE ${agentRuns.id} = ${runId}
          AND ${agentRuns.conversationId} = ${conversationId}
          AND ${agentRuns.trigger} = 'whatsapp'
        LIMIT 1
      `))[0];
      if (!row) {
        return decideWoztellRunRecovery({
          run: null,
          persistedAssistantReply: null,
        });
      }
      return decideWoztellRunRecovery({
        run: {
          status: String(row.status) as
            | "running"
            | "disabled"
            | "completed"
            | "failed"
            | "escalated",
          provider: row.provider == null ? null : String(row.provider),
          model: row.model == null ? null : String(row.model),
        },
        persistedAssistantReply: row.assistant_reply == null
          ? null
          : String(row.assistant_reply),
      });
    },
  };
}
