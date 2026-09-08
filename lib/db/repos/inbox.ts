import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {conversations, messages, profiles, staffTasks} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

export type InboxChannelFilter = "all" | "whatsapp" | "web";

export type InboxConversationSummary = Readonly<{
  id: string;
  channel: "whatsapp" | "web";
  locale: string;
  status: string;
  /** Member display name; null for an anonymous/prospect owner. */
  ownerLabel: string | null;
  profileId: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  messageCount: number;
  escalated: boolean;
}>;

export type InboxMessage = Readonly<{
  id: string;
  role: "user" | "assistant" | "tool";
  channel: "whatsapp" | "web";
  content: string;
  createdAt: Date;
}>;

export type InboxTranscript = Readonly<{conversation: InboxConversationSummary; messages: readonly InboxMessage[]}>;

const listOptionsSchema = z.object({
  channel: z.enum(["all", "whatsapp", "web"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
}).strict();

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function summaryFrom(row: Record<string, unknown>): InboxConversationSummary {
  return {
    id: String(row.id),
    channel: row.channel === "whatsapp" ? "whatsapp" : "web",
    locale: String(row.locale ?? "en"),
    status: String(row.status ?? "active"),
    ownerLabel: typeof row.display_name === "string" ? row.display_name : null,
    profileId: typeof row.profile_id === "string" ? row.profile_id : null,
    lastMessage: typeof row.last_message === "string" ? row.last_message : null,
    lastMessageAt: dateFrom(row.last_message_at),
    messageCount: Number(row.message_count ?? 0),
    escalated: Number(row.open_task_count ?? 0) > 0,
  };
}

/**
 * Staff read model over conversations + messages + staff_tasks. Read-only in
 * Phase A (audit F2): the human reply lane is Phase C. The channel of a
 * conversation is the channel of its latest message, because the
 * conversations table carries no channel column until Phase C.
 */
export function createInboxRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async listConversations(actor: Actor, options: unknown): Promise<readonly InboxConversationSummary[]> {
      requireAdmin(actor);
      const parsed = listOptionsSchema.parse(options);
      const database = await loadDatabase();
      const channelFilter = parsed.channel === "all" ? sql`TRUE` : sql`latest.channel = ${parsed.channel}`;
      const rows = rowsFrom(await database.execute(sql`
        WITH latest AS (
          SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id, m.channel, m.content AS last_message, m.created_at
          FROM ${messages} m
          ORDER BY m.conversation_id, m.created_at DESC
        ),
        counts AS (
          SELECT conversation_id, count(*)::int AS message_count FROM ${messages} GROUP BY conversation_id
        ),
        tasks AS (
          SELECT (context->>'conversationId') AS conversation_id, count(*)::int AS open_task_count
          FROM ${staffTasks} WHERE status = 'open' GROUP BY context->>'conversationId'
        )
        SELECT c.id, c.agent_kind, c.locale, c.status, c.last_message_at, c.profile_id,
               p.display_name, latest.channel, latest.last_message,
               COALESCE(counts.message_count, 0) AS message_count,
               COALESCE(tasks.open_task_count, 0) AS open_task_count
        FROM ${conversations} c
        LEFT JOIN ${profiles} p ON p.id = c.profile_id
        LEFT JOIN latest ON latest.conversation_id = c.id
        LEFT JOIN counts ON counts.conversation_id = c.id
        LEFT JOIN tasks ON tasks.conversation_id = c.id::text
        WHERE c.agent_kind = 'concierge' AND c.status <> 'deleted' AND ${channelFilter}
        ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
        LIMIT ${parsed.limit}
      `));
      return rows.map(summaryFrom);
    },

    async getTranscript(actor: Actor, conversationId: string): Promise<InboxTranscript | null> {
      requireAdmin(actor);
      const id = z.string().uuid().parse(conversationId);
      const database = await loadDatabase();
      const header = rowsFrom(await database.execute(sql`
        SELECT c.id, c.agent_kind, c.locale, c.status, c.last_message_at, c.profile_id, p.display_name,
               (SELECT channel FROM ${messages} m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS channel,
               (SELECT content FROM ${messages} m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
               (SELECT count(*)::int FROM ${messages} m WHERE m.conversation_id = c.id) AS message_count,
               (SELECT count(*)::int FROM ${staffTasks} t WHERE t.status = 'open' AND t.context->>'conversationId' = c.id::text) AS open_task_count
        FROM ${conversations} c
        LEFT JOIN ${profiles} p ON p.id = c.profile_id
        WHERE c.id = ${id} AND c.status <> 'deleted'
      `))[0];
      if (!header) return null;
      const transcript = rowsFrom(await database.execute(sql`
        SELECT id, role, channel, content, created_at
        FROM ${messages}
        WHERE conversation_id = ${id}
        ORDER BY created_at ASC, id ASC
        LIMIT 500
      `));
      return {
        conversation: summaryFrom(header),
        messages: transcript.map((row) => ({
          id: String(row.id),
          role: row.role === "assistant" ? "assistant" : row.role === "tool" ? "tool" : "user",
          channel: row.channel === "whatsapp" ? "whatsapp" : "web",
          content: String(row.content ?? ""),
          createdAt: dateFrom(row.created_at) ?? new Date(0),
        })),
      };
    },
  };
}

export type InboxRepository = ReturnType<typeof createInboxRepository>;
export const inboxRepository = createInboxRepository();
