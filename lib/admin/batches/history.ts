import {z} from "zod";

import {BATCH_STATES, batchRequestSchema, type BatchOperation, type BatchState} from "@/lib/admin/batches/types";

const operations = batchRequestSchema.options.map(option => option.shape.operation.value) as BatchOperation[];
export const batchOperationSchema = z.custom<BatchOperation>(value => typeof value === "string" && operations.includes(value as BatchOperation));
export const batchHistoryQuerySchema = z.object({cursor: z.string().min(1).max(512).optional(), state: z.enum(BATCH_STATES).optional(), operation: batchOperationSchema.optional()}).strict();
export function parseBatchHistoryRouteQuery(raw: Record<string, string | string[] | undefined>): BatchHistoryQuery {
  return batchHistoryQuerySchema.parse({cursor: raw.cursor === "" ? undefined : raw.cursor, state: raw.state === "" ? undefined : raw.state, operation: raw.operation === "" ? undefined : raw.operation});
}
export const batchHistoryOperations = operations;

export type BatchHistoryQuery = Readonly<{cursor?: string; state?: BatchState; operation?: BatchOperation}>;
export type BatchHistoryRow = Readonly<{
  id: string; operation: BatchOperation; state: BatchState;
  createdAt: string; actorLabel: string; total: number;
  succeeded: number; skipped: number; failed: number;
}>;
export type BatchHistoryPage = Readonly<{items: readonly BatchHistoryRow[]; nextCursor: string | null}>;
