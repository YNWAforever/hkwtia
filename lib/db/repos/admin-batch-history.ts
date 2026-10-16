import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {BATCH_STATES, type BatchOperation, type BatchState} from "@/lib/admin/batches/types";
import {batchHistoryQuerySchema, batchOperationSchema, type BatchHistoryPage, type BatchHistoryQuery, type BatchHistoryRow} from "@/lib/admin/batches/history";
import {requireAdmin} from "@/lib/auth/authorize";
import {adminBatches, profiles} from "@/lib/db/server-schema";
import type {AdminActor} from "@/lib/membership/lifecycle";
import type {BatchDatabase} from "@/lib/db/repos/admin-batches";
import {getDb} from "@/lib/db/repos/common";

const exactInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const cursorSchema = z.object({v: z.literal(1), at: z.string().regex(exactInstant), id: z.string().uuid(), state: z.enum(BATCH_STATES).nullable(), operation: batchOperationSchema.nullable()}).strict();
const countersSchema = z.record(z.number().int().nonnegative());
const rowSchema = z.object({id: z.string().uuid(), operation: batchOperationSchema, state: z.enum(BATCH_STATES), createdAt: z.coerce.date(), cursorAt: z.string().regex(exactInstant), actorLabel: z.string(), counters: countersSchema});
const PAGE_SIZE = 25;

type Cursor = z.infer<typeof cursorSchema>;
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
function decodeCursor(raw: string, state: BatchState | undefined, operation: BatchOperation | undefined): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("INVALID_BATCH_HISTORY_CURSOR");
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.toString("base64url") !== raw) throw new Error("INVALID_BATCH_HISTORY_CURSOR");
    const cursor = cursorSchema.parse(JSON.parse(decoded.toString("utf8")));
    if (cursor.state !== (state ?? null) || cursor.operation !== (operation ?? null)) throw new Error("INVALID_BATCH_HISTORY_CURSOR");
    return cursor;
  } catch {throw new Error("INVALID_BATCH_HISTORY_CURSOR");}
}
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
function toHistoryRow(raw: z.infer<typeof rowSchema>): BatchHistoryRow {
  const {pending = 0, running = 0, succeeded = 0, skipped = 0, failed = 0} = raw.counters;
  return {id: raw.id, operation: raw.operation, state: raw.state, createdAt: raw.createdAt.toISOString(), actorLabel: raw.actorLabel,
    total: pending + running + succeeded + skipped + failed, succeeded, skipped, failed};
}

export function createAdminBatchHistoryRepository(loadDatabase: () => Promise<BatchDatabase> = async () => await getDb() as unknown as BatchDatabase) {
  async function read(actor: AdminActor, input: BatchHistoryQuery, pageSize: number): Promise<BatchHistoryPage> {
    requireAdmin(actor);
    const query = batchHistoryQuerySchema.parse(input);
    const cursor = query.cursor ? decodeCursor(query.cursor, query.state, query.operation) : null;
    const database = await loadDatabase();
    const stateFilter = query.state ? sql`AND ${adminBatches.state} = ${query.state}` : sql``;
    const operationFilter = query.operation ? sql`AND ${adminBatches.operation} = ${query.operation}` : sql``;
    const cursorFilter = cursor ? sql`AND (${adminBatches.createdAt}, ${adminBatches.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``;
    const found = rows(await database.execute(sql`SELECT ${adminBatches.id} AS id, ${adminBatches.operation} AS operation,
      ${adminBatches.state} AS state, ${adminBatches.createdAt} AS "createdAt",
      to_char(${adminBatches.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt",
      ${profiles.displayName} AS "actorLabel", ${adminBatches.counters} AS counters
      FROM ${adminBatches} JOIN ${profiles} ON ${profiles.id} = ${adminBatches.actorProfileId}
      WHERE ${adminBatches.actorProfileId} = ${actor.profileId} ${stateFilter} ${operationFilter} ${cursorFilter}
      ORDER BY ${adminBatches.createdAt} DESC, ${adminBatches.id} DESC LIMIT ${pageSize + 1}`)).map(row => rowSchema.parse(row));
    const page = found.slice(0, pageSize);
    const last = page.at(-1);
    return {items: page.map(toHistoryRow), nextCursor: found.length > pageSize && last
      ? encodeCursor({v: 1, at: last.cursorAt, id: last.id, state: query.state ?? null, operation: query.operation ?? null}) : null};
  }
  return {
    list: (actor: AdminActor, input: BatchHistoryQuery = {}) => read(actor, input, PAGE_SIZE),
    recent: async (actor: AdminActor): Promise<readonly BatchHistoryRow[]> => (await read(actor, {}, 3)).items,
  };
}
export const adminBatchHistoryRepository = createAdminBatchHistoryRepository();

export async function listBatchHistory(actor: AdminActor, query: BatchHistoryQuery = {}): Promise<BatchHistoryPage> {
  return adminBatchHistoryRepository.list(actor, query);
}
