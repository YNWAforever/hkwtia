import "server-only";

import {z} from "zod";

import {resolveBatchCapability} from "@/lib/admin/batches/capabilities";
import {adminBatchesRepository} from "@/lib/db/repos/admin-batches";
import {batchPreviewDigest, batchRequestSchema, batchTargetSchema, type BatchItemFilter, type BatchOperation, type BatchRequest, type BatchPreview, type BatchState, type BatchTarget} from "@/lib/admin/batches/types";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type BatchSummary = Readonly<{batchId: string; state: BatchState; counters: Readonly<Record<"pending" | "running" | "succeeded" | "skipped" | "failed", number>>}>;
export type BatchGateway = Readonly<{
  create: (actor: AdminActor, request: BatchRequest, requestDigest: string) => Promise<{batchId: string}>;
  preview: (actor: AdminActor, id: string, cursor?: string | null, filter?: BatchItemFilter) => Promise<BatchPreview>;
  commit: (actor: AdminActor, id: string, digest: string) => Promise<BatchSummary>;
  retryFailed: (actor: AdminActor, id: string) => Promise<BatchSummary>;
  cancelPending: (actor: AdminActor, id: string) => Promise<BatchSummary>;
}>;
export type BatchItemRetryGateway = Readonly<{retryFailedItem: (actor: AdminActor, id: string, target: BatchTarget) => Promise<BatchSummary>}>;
const batchIdSchema = z.string().uuid();
const commitSchema = z.object({batchId: batchIdSchema, previewDigest: z.string().regex(/^[a-f0-9]{64}$/)}).strict();

/** No client actor or raw SQL enters the batch request; unregistered operations fail before persistence. */
export async function prepareBatch(actor: Actor, input: unknown, store: BatchGateway = adminBatchesRepository, capabilities?: ReadonlySet<BatchOperation>): Promise<{batchId: string}> {
  requireAdmin(actor);
  const request = batchRequestSchema.parse(input);
  const capability = resolveBatchCapability(actor, request.operation, capabilities);
  if (!capability.available) throw new Error(capability.reasonCode ?? "BATCH_OPERATION_UNAVAILABLE");
  return store.create(actor, request, batchPreviewDigest(request));
}
export async function getBatchPreview(actor: Actor, batchId: unknown, store: BatchGateway = adminBatchesRepository, cursor?: string | null, filter: BatchItemFilter = "all"): Promise<BatchPreview> {
  requireAdmin(actor);
  return store.preview(actor, batchIdSchema.parse(batchId), cursor, filter);
}
export async function commitBatch(actor: Actor, input: unknown, store: BatchGateway = adminBatchesRepository): Promise<BatchSummary> {
  requireAdmin(actor);
  const parsed = commitSchema.parse(input);
  return store.commit(actor, parsed.batchId, parsed.previewDigest);
}
export async function retryFailedBatchItems(actor: Actor, batchId: unknown, store: BatchGateway = adminBatchesRepository): Promise<BatchSummary> {
  requireAdmin(actor);
  return store.retryFailed(actor, batchIdSchema.parse(batchId));
}
export async function retryFailedBatchItem(actor: Actor, batchId: unknown, target: unknown, store: BatchItemRetryGateway = adminBatchesRepository): Promise<BatchSummary> {
  requireAdmin(actor);
  return store.retryFailedItem(actor, batchIdSchema.parse(batchId), batchTargetSchema.parse(target));
}
export async function cancelPendingBatchItems(actor: Actor, batchId: unknown, store: BatchGateway = adminBatchesRepository): Promise<BatchSummary> {
  requireAdmin(actor);
  return store.cancelPending(actor, batchIdSchema.parse(batchId));
}
