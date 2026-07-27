import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {conversations, messages} from "@/lib/db/server-schema";
import {forbidden} from "@/lib/membership/lifecycle";

export type ConversationOwner =
  | Readonly<{kind: "profile"; profileId: string}>
  | Readonly<{kind: "anonymous"; anonymousOwnerHash: string}>;

export type ConversationRecord = Readonly<{
  id: string;
  profileId: string | null;
  anonymousOwnerHash: string | null;
  locale: "en" | "zh-HK";
  status: "active" | "closed" | "deleted";
  lastMessageAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ConversationMessageRecord = Readonly<{
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool";
  channel: "web" | "whatsapp";
  content: string;
  providerMessageId: string | null;
  metadata: Readonly<Record<string, unknown>>;
  citations: readonly Readonly<Record<string, unknown>>[];
  createdAt: Date;
}>;

export type AppendedMessage = ConversationMessageRecord & Readonly<{
  disposition: "created" | "existing";
}>;

const ownerSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("profile"), profileId: z.string().min(1).max(255)}).strict(),
  z.object({
    kind: z.literal("anonymous"),
    anonymousOwnerHash: z.string().min(32).max(255),
  }).strict(),
]);
const conversationIdSchema = z.string().uuid();
const createInputSchema = z.object({
  locale: z.enum(["en", "zh-HK"]),
  expiresAt: z.date().refine((value) => Number.isFinite(value.getTime())),
}).strict();
const appendMessageInputSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  channel: z.enum(["web", "whatsapp"]),
  content: z.string().min(1).max(50_000),
  providerMessageId: z.string().min(1).max(255).nullish(),
  metadata: z.record(z.unknown()).optional(),
  citations: z.array(z.record(z.unknown())).max(50).optional(),
}).strict();
const deleteExpiredInputSchema = z.object({
  asOf: z.date().refine((value) => Number.isFinite(value.getTime())),
  limit: z.number().int().positive().max(1_000),
}).strict();

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_REPOSITORY_DATE");
  return date;
}

function optionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : requiredDate(value);
}

function conversationFrom(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    profileId: row.profile_id === null || row.profile_id === undefined
      ? null
      : String(row.profile_id),
    anonymousOwnerHash:
      row.anonymous_owner_hash === null || row.anonymous_owner_hash === undefined
        ? null
        : String(row.anonymous_owner_hash),
    locale: String(row.locale) as ConversationRecord["locale"],
    status: String(row.status) as ConversationRecord["status"],
    lastMessageAt: optionalDate(row.last_message_at),
    expiresAt: requiredDate(row.expires_at),
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function messageFrom(row: Record<string, unknown>): ConversationMessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as ConversationMessageRecord["role"],
    channel: String(row.channel) as ConversationMessageRecord["channel"],
    content: String(row.content),
    providerMessageId:
      row.provider_message_id === null || row.provider_message_id === undefined
        ? null
        : String(row.provider_message_id),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    citations: Array.isArray(row.citations)
      ? row.citations as Record<string, unknown>[]
      : [],
    createdAt: requiredDate(row.created_at),
  };
}

function ownerValues(owner: ConversationOwner) {
  const parsed = ownerSchema.parse(owner);
  return parsed.kind === "profile"
    ? {profileId: parsed.profileId, anonymousOwnerHash: null}
    : {profileId: null, anonymousOwnerHash: parsed.anonymousOwnerHash};
}

function ownerPredicate(owner: ConversationOwner): SQL {
  const parsed = ownerSchema.parse(owner);
  return parsed.kind === "profile"
    ? sql`${conversations.profileId} = ${parsed.profileId} AND ${conversations.anonymousOwnerHash} IS NULL`
    : sql`${conversations.profileId} IS NULL AND ${conversations.anonymousOwnerHash} = ${parsed.anonymousOwnerHash}`;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

async function getOwnedFrom(
  database: AutomationSqlExecutor,
  owner: ConversationOwner,
  conversationId: string,
): Promise<ConversationRecord> {
  const parsedId = conversationIdSchema.parse(conversationId);
  const row = rowsFrom(await database.execute(sql`
    SELECT * FROM ${conversations}
    WHERE ${conversations.id} = ${parsedId}
      AND ${ownerPredicate(owner)}
    LIMIT 1
  `))[0];
  if (!row) forbidden();
  return conversationFrom(row);
}

export function createConversationsRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async create(owner: ConversationOwner, input: unknown): Promise<ConversationRecord> {
      const parsedInput = createInputSchema.parse(input);
      const ownerColumns = ownerValues(owner);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${conversations}
          (profile_id, anonymous_owner_hash, locale, expires_at)
        VALUES (
          ${ownerColumns.profileId},
          ${ownerColumns.anonymousOwnerHash},
          ${parsedInput.locale},
          ${parsedInput.expiresAt}
        )
        RETURNING *
      `))[0];
      if (!row) throw new Error("CONVERSATION_CREATE_FAILED");
      return conversationFrom(row);
    },

    async getOwned(
      owner: ConversationOwner,
      conversationId: string,
    ): Promise<ConversationRecord> {
      return getOwnedFrom(await loadDatabase(), owner, conversationId);
    },

    async appendMessage(
      owner: ConversationOwner,
      conversationId: string,
      input: unknown,
    ): Promise<AppendedMessage> {
      const parsedId = conversationIdSchema.parse(conversationId);
      const parsed = appendMessageInputSchema.parse(input);
      const database = await loadDatabase();
      await getOwnedFrom(database, owner, parsedId);
      const providerMessageId = parsed.providerMessageId ?? null;
      const row = rowsFrom(await database.execute(sql`
        WITH inserted AS (
          INSERT INTO ${messages}
            (
              conversation_id,
              role,
              channel,
              content,
              provider_message_id,
              metadata,
              citations
            )
          VALUES (
            ${parsedId},
            ${parsed.role},
            ${parsed.channel},
            ${parsed.content},
            ${providerMessageId},
            ${parsed.metadata ?? {}},
            ${parsed.citations ?? []}
          )
          ON CONFLICT (provider_message_id)
            WHERE provider_message_id IS NOT NULL
          DO NOTHING
          RETURNING *
        ),
        selected AS (
          SELECT inserted.*, 'created'::text AS disposition
          FROM inserted
          UNION ALL
          SELECT existing.*, 'existing'::text AS disposition
          FROM ${messages} AS existing
          WHERE ${providerMessageId} IS NOT NULL
            AND existing.conversation_id = ${parsedId}
            AND existing.provider_message_id = ${providerMessageId}
            AND NOT EXISTS (SELECT 1 FROM inserted)
          LIMIT 1
        ),
        touched AS (
          UPDATE ${conversations}
          SET
            last_message_at = GREATEST(
              COALESCE(last_message_at, (SELECT created_at FROM selected)),
              (SELECT created_at FROM selected)
            ),
            updated_at = GREATEST(updated_at, (SELECT created_at FROM selected))
          WHERE id = ${parsedId}
            AND EXISTS (SELECT 1 FROM selected)
          RETURNING id
        )
        SELECT selected.*
        FROM selected, touched
        LIMIT 1
      `))[0];
      if (!row) throw new Error("MESSAGE_CREATE_CONFLICT");
      return {
        ...messageFrom(row),
        disposition: String(row.disposition) as AppendedMessage["disposition"],
      };
    },

    async listMessages(
      owner: ConversationOwner,
      conversationId: string,
    ): Promise<readonly ConversationMessageRecord[]> {
      const parsedId = conversationIdSchema.parse(conversationId);
      const database = await loadDatabase();
      await getOwnedFrom(database, owner, parsedId);
      return rowsFrom(await database.execute(sql`
        SELECT * FROM ${messages}
        WHERE ${messages.conversationId} = ${parsedId}
        ORDER BY ${messages.createdAt}, ${messages.id}
      `)).map(messageFrom);
    },

    async deleteExpired(
      actor: AutomationRepositoryActor,
      input: unknown,
    ): Promise<number> {
      requireAutomationSystem(actor);
      const parsed = deleteExpiredInputSchema.parse(input);
      const database = await loadDatabase();
      const deleted = rowsFrom(await database.execute(sql`
        WITH candidates AS (
          SELECT ${conversations.id}
          FROM ${conversations}
          WHERE ${conversations.expiresAt} <= ${parsed.asOf}
          ORDER BY ${conversations.expiresAt}, ${conversations.id}
          LIMIT ${parsed.limit}
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM ${conversations} AS expired
        USING candidates
        WHERE expired.id = candidates.id
        RETURNING expired.id
      `));
      return deleted.length;
    },
  };
}

export type ConversationsRepository =
  ReturnType<typeof createConversationsRepository>;
export const conversationsRepository = createConversationsRepository();
export const conversationsRepo = conversationsRepository;
