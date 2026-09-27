import "server-only";

import {z} from "zod";

import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {adminBatchesRepository} from "@/lib/db/repos/admin-batches";
import {batchPreviewDigest, batchRequestSchema, type BatchOperation, type BatchRequest, type BatchPreview, type BatchState} from "@/lib/admin/batches/types";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type BatchSummary = Readonly<{batchId: string; state: BatchState; counters: Readonly<Record<"pending" | "running" | "succeeded" | "skipped" | "failed", number>>}>;
export type BatchGateway = Readonly<{
  create: (actor: AdminActor, request: BatchRequest, requestDigest: string) => Promise<{batchId: string}>;
  preview: (actor: AdminActor, id: string) => Promise<BatchPreview>;
  commit: (actor: AdminActor, id: string, digest: string) => Promise<BatchSummary>;
  retryFailed: (actor: AdminActor, id: string) => Promise<BatchSummary>;
  cancelPending: (actor: AdminActor, id: string) => Promise<BatchSummary>;
}>;
const batchIdSchema = z.string().uuid();
const commitSchema = z.object({batchId: batchIdSchema, previewDigest: z.string().regex(/^[a-f0-9]{64}$/)}).strict();

/** No client actor or raw SQL enters the batch request; unregistered operations fail before persistence. */
export async function prepareBatch(actor: Actor, input: unknown, store: BatchGateway = adminBatchesRepository, capabilities: ReadonlySet<BatchOperation> = new Set(process.env.ADMIN_BATCH_ENABLED === "true" ? Object.keys(batchOperationHandlers) as BatchOperation[] : [])): Promise<{batchId: string}> {
  requireAdmin(actor);
  const request = batchRequestSchema.parse(input);
  if (!capabilities.has(request.operation) || (request.operation === "import_commit" && process.env.MEMBER_IMPORT_ENABLED !== "true") || (request.operation === "membership_grant" && (process.env.MEMBERSHIP_GRANTS_ENABLED !== "true" || process.env.MEMBERSHIP_GRANT_BATCH_ENABLED !== "true"))) throw new Error("BATCH_OPERATION_UNAVAILABLE");
  if (request.operation === "export_members" && process.env.MEMBER_EXPORT_ENABLED !== "true") throw new Error("BATCH_OPERATION_UNAVAILABLE");
  if (request.operation === "ticket_resend" && process.env.TICKET_RESEND_BATCH_ENABLED !== "true") throw new Error("BATCH_OPERATION_UNAVAILABLE");
  if (request.operation === "membership_grant" && actor.kind !== "superadmin") throw new Error("FORBIDDEN");
  return store.create(actor, request, batchPreviewDigest(request));
}
export async function getBatchPreview(actor: Actor, batchId: unknown, store: BatchGateway = adminBatchesRepository): Promise<BatchPreview> {
  requireAdmin(actor);
  return store.preview(actor, batchIdSchema.parse(batchId));
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
export async function cancelPendingBatchItems(actor: Actor, batchId: unknown, store: BatchGateway = adminBatchesRepository): Promise<BatchSummary> {
  requireAdmin(actor);
  return store.cancelPending(actor, batchIdSchema.parse(batchId));
}
