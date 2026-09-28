import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {batchPreviewDigest, batchRetryDelayMs, batchRuntimeConfig, batchRequestSchema, type BatchRequest, type BatchPreview, type BatchProgressItem} from "@/lib/admin/batches/types";
import {decodeScopedCursor, encodeScopedCursor} from "@/lib/admin/pagination";
import type {BatchClaim, BatchHandlerRegistry, BatchOperationHandler, BatchWorkerRepository, BatchItemOutcome} from "@/lib/admin/batches/worker-types";
import type {BatchGateway, BatchSummary} from "@/lib/admin/batches/service";
import {requireAdmin} from "@/lib/auth/authorize";
import type {AdminActor} from "@/lib/membership/lifecycle";
import {adminBatchItems, adminBatches, auditEvents, profiles} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";

export type BatchExecutor = Readonly<{execute: (statement: SQL) => PromiseLike<unknown>}>;
export type BatchDatabase = BatchExecutor & Readonly<{transaction: <T>(run: (tx: BatchExecutor) => Promise<T>, config?: {isolationLevel: "read committed" | "repeatable read"}) => Promise<T>}>;
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
const countersSchema = z.object({pending: z.number().int().nonnegative().default(0), running: z.number().int().nonnegative().default(0), succeeded: z.number().int().nonnegative().default(0), skipped: z.number().int().nonnegative().default(0), failed: z.number().int().nonnegative().default(0)}).passthrough();
const batchRowSchema = z.object({id: z.string().uuid(), actorProfileId: z.string(), operation: z.enum(["profile_patch", "import_commit", "membership_grant", "renewal_reminder", "profile_update_invite", "ticket_resend", "export_members", "export_event_attendees"]), state: z.enum(["preparing", "ready", "queued", "running", "completed", "completed_with_errors", "cancelled", "expired"]), previewDigest: z.string().nullable().default(null), previewExpiresAt: z.coerce.date().nullable().default(null), counters: countersSchema.default({}), validatedPayload: z.record(z.unknown()).default({})});
const itemRowSchema = z.object({targetType: z.enum(["profile", "membership", "company", "ticket_seat", "import_row", "event"]), targetId: z.string(), previewStatus: z.enum(["eligible", "skipped", "blocked"]), expectedVersion: z.string(), beforeSummary: z.record(z.unknown()).default({}), afterSummary: z.record(z.unknown()).default({}), reasonCode: z.string().nullable().default(null), state: z.enum(["pending", "running", "succeeded", "skipped", "failed"]).default("pending"), attemptCount: z.coerce.number().int().nonnegative().default(0), errorCode: z.string().nullable().default(null), resultRef: z.string().nullable().default(null)});
type BatchRow = z.infer<typeof batchRowSchema>;
function firstRow(result: unknown): unknown {return rows(result)[0];}
async function readOwned(executor: BatchExecutor, actorProfileId: string, batchId: string, lock: boolean): Promise<BatchRow> {
  const result = await executor.execute(sql`SELECT ${adminBatches.id} AS id, ${adminBatches.actorProfileId} AS "actorProfileId", ${adminBatches.operation} AS operation, ${adminBatches.state} AS state, ${adminBatches.previewDigest} AS "previewDigest", ${adminBatches.previewExpiresAt} AS "previewExpiresAt", ${adminBatches.counters} AS counters, ${adminBatches.validatedPayload} AS "validatedPayload" FROM ${adminBatches} WHERE ${adminBatches.id} = ${batchId}::uuid AND ${adminBatches.actorProfileId} = ${actorProfileId} ${lock ? sql`FOR UPDATE` : sql``}`);
  const row = firstRow(result);
  if (!row) throw new Error("BATCH_NOT_FOUND");
  return batchRowSchema.parse(row);
}
function summary(row: BatchRow, state = row.state): BatchSummary {
  return {batchId: row.id, state, counters: countersSchema.parse(row.counters)};
}
function itemPreview(row: unknown): BatchProgressItem {
  const item = itemRowSchema.parse(row);
  return {target: {type: item.targetType, id: item.targetId}, previewStatus: item.previewStatus, eligible: item.previewStatus === "eligible", reasonCode: item.reasonCode, before: item.beforeSummary, after: item.afterSummary, expectedVersion: item.expectedVersion, state: item.state, attemptCount: item.attemptCount, errorCode: item.errorCode, resultRef: item.resultRef};
}

export type BatchStatusRepository = BatchGateway & Readonly<{status: (actor: AdminActor, batchId: string) => Promise<BatchSummary>}>;
export function createAdminBatchesRepository(loadDatabase: () => Promise<BatchDatabase> = async () => await getDb() as unknown as BatchDatabase, now: () => Date = () => new Date()): BatchStatusRepository {
  return {
    async create(actor, request: BatchRequest, requestDigest) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const inserted = firstRow(await tx.execute(sql`INSERT INTO ${adminBatches} (actor_profile_id, operation, validated_payload, selection_snapshot, idempotency_key, request_digest, state) VALUES (${actor.profileId}, ${request.operation}, ${JSON.stringify(request.payload)}::jsonb, ${JSON.stringify(request)}::jsonb, ${request.idempotencyKey}, ${requestDigest}, 'preparing') ON CONFLICT (actor_profile_id, idempotency_key) DO NOTHING RETURNING id`));
        if (inserted && typeof inserted === "object" && "id" in inserted && typeof inserted.id === "string") {
          await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'admin.batch.prepared', 'admin_batch', ${inserted.id}, jsonb_build_object('operation', ${request.operation}::text))`);
          return {batchId: inserted.id};
        }
        const existing = firstRow(await tx.execute(sql`SELECT ${adminBatches.id} AS id, ${adminBatches.requestDigest} AS "requestDigest" FROM ${adminBatches} WHERE ${adminBatches.actorProfileId} = ${actor.profileId} AND ${adminBatches.idempotencyKey} = ${request.idempotencyKey}`));
        const row = z.object({id: z.string().uuid(), requestDigest: z.string()}).parse(existing);
        if (row.requestDigest !== requestDigest) throw new Error("BATCH_IDEMPOTENCY_CONFLICT");
        return {batchId: row.id};
      });
    },
    async status(actor, batchId): Promise<BatchSummary> {
      requireAdmin(actor);
      const db = await loadDatabase();
      return summary(await readOwned(db, actor.profileId, z.string().uuid().parse(batchId), false));
    },    async preview(actor, batchId, cursor): Promise<BatchPreview> {
      requireAdmin(actor);
      const db = await loadDatabase();
      const batch = await readOwned(db, actor.profileId, batchId, false);
      const config = batchRuntimeConfig();
      const counts = z.object({
        total: z.coerce.number().int().nonnegative(),
        eligible: z.coerce.number().int().nonnegative(),
        skipped: z.coerce.number().int().nonnegative(),
        blocked: z.coerce.number().int().nonnegative(),
        retryable: z.coerce.number().int().nonnegative(),
      }).parse(firstRow(await db.execute(sql`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE ${adminBatchItems.previewStatus} = 'eligible')::int AS eligible,
          count(*) FILTER (WHERE ${adminBatchItems.previewStatus} = 'skipped')::int AS skipped,
          count(*) FILTER (WHERE ${adminBatchItems.previewStatus} = 'blocked')::int AS blocked,
          count(*) FILTER (WHERE ${adminBatchItems.state} = 'failed'
            AND left(${adminBatchItems.errorCode}, 10) = 'TRANSIENT_'
            AND ${adminBatchItems.attemptCount} < ${config.maxAttempts})::int AS retryable
        FROM ${adminBatchItems} WHERE ${adminBatchItems.batchId} = ${batchId}::uuid
      `)));
      if (counts.total > config.maxItems) throw new Error("BATCH_TOO_LARGE");
      const scope = `admin-batch:${batchId}`;
      const key = cursor ? decodeScopedCursor(scope, cursor) : null;
      const after = key ? sql`AND (${adminBatchItems.targetType}, ${adminBatchItems.targetId}) > (${key[0]}, ${key[1]})` : sql``;
      const pageSize = 50;
      const data = rows(await db.execute(sql`
        SELECT ${adminBatchItems.targetType} AS "targetType", ${adminBatchItems.targetId} AS "targetId",
          ${adminBatchItems.previewStatus} AS "previewStatus", ${adminBatchItems.expectedVersion} AS "expectedVersion",
          ${adminBatchItems.beforeSummary} AS "beforeSummary", ${adminBatchItems.afterSummary} AS "afterSummary",
          ${adminBatchItems.reasonCode} AS "reasonCode", ${adminBatchItems.state} AS state,
          ${adminBatchItems.attemptCount} AS "attemptCount", ${adminBatchItems.errorCode} AS "errorCode",
          ${adminBatchItems.resultRef} AS "resultRef"
        FROM ${adminBatchItems} WHERE ${adminBatchItems.batchId} = ${batchId}::uuid ${after}
        ORDER BY ${adminBatchItems.targetType}, ${adminBatchItems.targetId} LIMIT ${pageSize + 1}
      `));
      const items = data.slice(0, pageSize).map(itemPreview);
      const last = items.at(-1);
      const nextCursor = data.length > pageSize && last
        ? encodeScopedCursor(scope, [last.target.type, last.target.id, ""]) : null;
      return {
        batchId, operation: batch.operation,
        state: batch.state === "ready" && batch.previewExpiresAt && batch.previewExpiresAt.getTime() <= now().getTime() ? "expired" : batch.state,
        counters: countersSchema.parse(batch.counters), digest: batch.previewDigest ?? "",
        expiresAt: batch.previewExpiresAt?.toISOString() ?? "",
        total: counts.total, eligible: counts.eligible, skipped: counts.skipped, blocked: counts.blocked,
        retryableFailed: counts.retryable > 0, items, nextCursor,
      };
    },
    async commit(actor, batchId, digest) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const batch = await readOwned(tx, actor.profileId, batchId, true);
        if (batch.state !== "ready") throw new Error("BATCH_NOT_READY");
        if (batch.previewDigest !== digest) throw new Error("BATCH_PREVIEW_MISMATCH");
        if (!batch.previewExpiresAt || batch.previewExpiresAt.getTime() <= now().getTime()) throw new Error("BATCH_PREVIEW_EXPIRED");
        const updated = firstRow(await tx.execute(sql`UPDATE ${adminBatches} SET state = 'queued', committed_at = ${now()}, updated_at = ${now()} WHERE ${adminBatches.id} = ${batchId}::uuid AND ${adminBatches.actorProfileId} = ${actor.profileId} AND ${adminBatches.state} = 'ready' AND ${adminBatches.previewDigest} = ${digest} RETURNING ${adminBatches.id} AS id`));
        if (!updated) throw new Error("BATCH_COMMIT_CONFLICT");
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'admin.batch.committed', 'admin_batch', ${batchId}, jsonb_build_object('operation', ${batch.operation}::text))`);
        return summary(batch, "queued");
      });
    },
    async retryFailed(actor, batchId) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const batch = await readOwned(tx, actor.profileId, batchId, true);
        if (batch.state !== "completed_with_errors" && batch.state !== "running") throw new Error("BATCH_RETRY_UNAVAILABLE");
        const retried = rows(await tx.execute(sql`UPDATE ${adminBatchItems} SET state = 'pending', next_attempt_at = NULL, lease_owner = NULL, lease_expires_at = NULL, error_code = NULL, updated_at = ${now()} WHERE ${adminBatchItems.batchId} = ${batchId}::uuid AND ${adminBatchItems.state} = 'failed' AND left(${adminBatchItems.errorCode}, 10) = 'TRANSIENT_' AND ${adminBatchItems.attemptCount} < ${batchRuntimeConfig().maxAttempts} RETURNING ${adminBatchItems.id} AS id`));
        if (retried.length === 0) throw new Error("BATCH_NOTHING_RETRYABLE");
        await tx.execute(sql`UPDATE ${adminBatches} SET state = 'queued', updated_at = ${now()} WHERE ${adminBatches.id} = ${batchId}::uuid`);
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'admin.batch.retry_requested', 'admin_batch', ${batchId}, jsonb_build_object('count', ${retried.length}::int))`);
        await refreshBatchCounters(tx, batchId, now());
        return summary(await readOwned(tx, actor.profileId, batchId, false));
      });
    },
    async cancelPending(actor, batchId) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const batch = await readOwned(tx, actor.profileId, batchId, true);
        if (!["queued", "running", "ready"].includes(batch.state)) throw new Error("BATCH_CANCEL_UNAVAILABLE");
        await tx.execute(sql`UPDATE ${adminBatchItems} SET state = 'skipped', reason_code = 'BATCH_CANCELLED', updated_at = ${now()} WHERE ${adminBatchItems.batchId} = ${batchId}::uuid AND ${adminBatchItems.state} = 'pending'`);
        await tx.execute(sql`UPDATE ${adminBatches} SET state = 'cancelled', updated_at = ${now()} WHERE ${adminBatches.id} = ${batchId}::uuid`);
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'admin.batch.cancelled', 'admin_batch', ${batchId}, '{}'::jsonb)`);
        await refreshBatchCounters(tx, batchId, now());
        return summary(await readOwned(tx, actor.profileId, batchId, false));
      });
    },
  };
}
export const adminBatchesRepository = createAdminBatchesRepository();

const claimRowSchema = z.object({
  itemId: z.string().uuid(), batchId: z.string().uuid(), operation: z.enum(["profile_patch", "import_commit", "membership_grant", "renewal_reminder", "profile_update_invite", "ticket_resend", "export_members", "export_event_attendees"]),
  actorProfileId: z.string(), selectionSnapshot: z.unknown(), targetType: z.enum(["profile", "membership", "company", "ticket_seat", "import_row", "event"]), targetId: z.string(), expectedVersion: z.string(), effectKey: z.string(), attemptCount: z.coerce.number().int().positive(), leaseOwner: z.string(), leaseToken: z.coerce.number().int().positive(),
});
function toClaim(raw: unknown): BatchClaim {
  const row = claimRowSchema.parse(raw);
  return {itemId: row.itemId, batchId: row.batchId, operation: row.operation, actorProfileId: row.actorProfileId, request: batchRequestSchema.parse(row.selectionSnapshot), target: {type: row.targetType, id: row.targetId}, expectedVersion: row.expectedVersion, effectKey: row.effectKey, attemptCount: row.attemptCount, leaseOwner: row.leaseOwner, leaseToken: row.leaseToken};
}
async function refreshBatchCounters(tx: BatchExecutor, batchId: string, now: Date) {
  await tx.execute(sql`WITH counts AS (
    SELECT count(*) FILTER (WHERE state = 'pending')::int AS pending, count(*) FILTER (WHERE state = 'running')::int AS running,
      count(*) FILTER (WHERE state = 'succeeded')::int AS succeeded, count(*) FILTER (WHERE state = 'skipped')::int AS skipped,
      count(*) FILTER (WHERE state = 'failed')::int AS failed
    FROM ${adminBatchItems} WHERE ${adminBatchItems.batchId} = ${batchId}::uuid
  ) UPDATE ${adminBatches} SET counters = jsonb_build_object('pending', counts.pending, 'running', counts.running, 'succeeded', counts.succeeded, 'skipped', counts.skipped, 'failed', counts.failed),
    state = CASE WHEN ${adminBatches.state} = 'cancelled' THEN 'cancelled' WHEN counts.running > 0 THEN 'running' WHEN counts.pending > 0 THEN 'queued' WHEN counts.failed > 0 THEN 'completed_with_errors' ELSE 'completed' END,
    updated_at = ${now}
    FROM counts WHERE ${adminBatches.id} = ${batchId}::uuid AND ${adminBatches.state} IN ('queued','running','cancelled')`);
}
class StaleBatchClaim extends Error {constructor() {super("STALE_BATCH_CLAIM");}}
async function settleClaim(tx: BatchExecutor, claim: BatchClaim, outcome: BatchItemOutcome, now: Date): Promise<boolean> {
  const retryable = outcome.status === "retryable" && claim.attemptCount < batchRuntimeConfig().maxAttempts;
  const nextState = outcome.status === "succeeded" ? "succeeded" : outcome.status === "skipped" ? "skipped" : retryable ? "pending" : "failed";
  const errorCode = outcome.status === "retryable" || outcome.status === "failed" ? outcome.errorCode.slice(0, 100) : null;
  const nextAttemptAt = retryable ? new Date(now.getTime() + batchRetryDelayMs(claim.attemptCount)) : null;
  const resultRef = outcome.status === "succeeded" ? outcome.resultRef : null;
  const reasonCode = outcome.status === "skipped" ? outcome.reasonCode.slice(0, 100) : null;
  const settled = firstRow(await tx.execute(sql`UPDATE ${adminBatchItems} SET state = ${nextState}, next_attempt_at = ${nextAttemptAt}, lease_owner = NULL, lease_expires_at = NULL, result_ref = ${resultRef}, error_code = ${errorCode}, reason_code = ${reasonCode}, updated_at = ${now} WHERE ${adminBatchItems.id} = ${claim.itemId}::uuid AND ${adminBatchItems.batchId} = ${claim.batchId}::uuid AND ${adminBatchItems.state} = 'running' AND ${adminBatchItems.leaseOwner} = ${claim.leaseOwner} AND ${adminBatchItems.leaseToken} = ${claim.leaseToken} AND ${adminBatchItems.leaseExpiresAt} > ${now} RETURNING ${adminBatchItems.id} AS id`));
  if (!settled) return false;
  await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${claim.actorProfileId}, 'system', 'admin.batch.item.settled', 'admin_batch_item', ${claim.itemId}, jsonb_build_object('state', ${nextState}::text, 'attempt', ${claim.attemptCount}::int))`);
  await refreshBatchCounters(tx, claim.batchId, now);
  return true;
}

export function createAdminBatchWorkerRepository(loadDatabase: () => Promise<BatchDatabase> = async () => await getDb() as unknown as BatchDatabase): BatchWorkerRepository {
  return {
    async prepareNext(handlers: BatchHandlerRegistry, now: Date) {
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const raw = firstRow(await tx.execute(sql`SELECT ${adminBatches.id} AS id, ${adminBatches.actorProfileId} AS "actorProfileId", ${adminBatches.operation} AS operation, ${adminBatches.selectionSnapshot} AS "selectionSnapshot", ${adminBatches.requestDigest} AS "requestDigest" FROM ${adminBatches} WHERE ${adminBatches.state} = 'preparing' ORDER BY ${adminBatches.createdAt}, ${adminBatches.id} FOR UPDATE SKIP LOCKED LIMIT 1`));
        if (!raw) return false;
        const batch = z.object({id: z.string().uuid(), actorProfileId: z.string(), operation: z.enum(["profile_patch", "import_commit", "membership_grant", "renewal_reminder", "profile_update_invite", "ticket_resend", "export_members", "export_event_attendees"]), selectionSnapshot: z.unknown(), requestDigest: z.string()}).parse(raw);
        const roleRow = firstRow(await tx.execute(sql`SELECT ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${batch.actorProfileId} LIMIT 1`));
        const role = z.object({role: z.string()}).safeParse(roleRow);
        const handler = handlers[batch.operation];
        if (!role.success || !["staff", "exco", "superadmin"].includes(role.data.role) || !handler) {
          await tx.execute(sql`UPDATE ${adminBatches} SET state = 'expired', updated_at = ${now} WHERE ${adminBatches.id} = ${batch.id}::uuid AND ${adminBatches.state} = 'preparing'`);
          return true;
        }
        const request = batchRequestSchema.parse(batch.selectionSnapshot);
        if (request.operation !== batch.operation) throw new Error("BATCH_REQUEST_MISMATCH");
        const actor = {kind: role.data.role, userId: batch.actorProfileId, profileId: batch.actorProfileId} as AdminActor;
        const preview = await handler.prepare(actor, request, tx);
        const config = batchRuntimeConfig();
        const unique = new Set(preview.map((item) => `${item.target.type}:${item.target.id}`));
        if (preview.length > config.maxItems || unique.size !== preview.length) {
          await tx.execute(sql`UPDATE ${adminBatches} SET state = 'expired', updated_at = ${now} WHERE ${adminBatches.id} = ${batch.id}::uuid AND ${adminBatches.state} = 'preparing'`);
          return true;
        }
        for (const item of preview) if (item.eligible !== (item.previewStatus === "eligible") || !item.expectedVersion || (item.previewStatus !== "eligible" && !item.reasonCode)) throw new Error("INVALID_BATCH_PREVIEW");
        const sorted = [...preview].sort((a, b) => `${a.target.type}:${a.target.id}`.localeCompare(`${b.target.type}:${b.target.id}`));
        const digest = batchPreviewDigest({batchId: batch.id, operation: batch.operation, requestDigest: batch.requestDigest, items: sorted});
        const records = sorted.map((item) => ({target_type: item.target.type, target_id: item.target.id, expected_version: item.expectedVersion, before_summary: item.before, after_summary: item.after, preview_status: item.previewStatus, state: item.eligible ? "pending" : "skipped", effect_key: batchPreviewDigest({batchId: batch.id, operation: batch.operation, target: item.target}), reason_code: item.reasonCode}));
        if (records.length) await tx.execute(sql`INSERT INTO ${adminBatchItems} (batch_id, target_type, target_id, expected_version, before_summary, after_summary, preview_status, state, effect_key, reason_code) SELECT ${batch.id}::uuid, value.target_type, value.target_id, value.expected_version, value.before_summary, value.after_summary, value.preview_status, value.state, value.effect_key, value.reason_code FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS value(target_type text, target_id text, expected_version text, before_summary jsonb, after_summary jsonb, preview_status text, state text, effect_key text, reason_code text)`);
        const counters = {pending: records.filter((item) => item.state === "pending").length, running: 0, succeeded: 0, skipped: records.filter((item) => item.state === "skipped").length, failed: 0};
        const updated = firstRow(await tx.execute(sql`UPDATE ${adminBatches} SET state = 'ready', preview_digest = ${digest}, preview_expires_at = ${new Date(now.getTime() + config.previewTtlMs)}, counters = ${JSON.stringify(counters)}::jsonb, prepared_at = ${now}, updated_at = ${now} WHERE ${adminBatches.id} = ${batch.id}::uuid AND ${adminBatches.state} = 'preparing' RETURNING ${adminBatches.id} AS id`));
        if (!updated) throw new Error("BATCH_PREPARE_CONFLICT");
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${batch.actorProfileId}, 'system', 'admin.batch.preview_ready', 'admin_batch', ${batch.id}, jsonb_build_object('eligible', ${counters.pending}::int, 'skipped', ${counters.skipped}::int))`);
        return true;
      }, {isolationLevel: "repeatable read"});
    },
    async claimItems(workerId, now, limit) {
      if (!workerId || workerId.length > 120 || !Number.isSafeInteger(limit) || limit < 1 || limit > batchRuntimeConfig().claimSize) throw new Error("INVALID_BATCH_CLAIM");
      const db = await loadDatabase();
      const claimed = rows(await db.execute(sql`WITH due AS (
        SELECT i.id FROM ${adminBatchItems} i INNER JOIN ${adminBatches} b ON b.id = i.batch_id
        WHERE b.state IN ('queued','running') AND i.preview_status = 'eligible' AND i.attempt_count < ${batchRuntimeConfig().maxAttempts}
          AND ((i.state = 'pending' AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= ${now})) OR (i.state = 'running' AND i.lease_expires_at <= ${now}))
        ORDER BY i.next_attempt_at NULLS FIRST, i.id FOR UPDATE OF i SKIP LOCKED LIMIT ${limit}
      ), claimed AS (
        UPDATE ${adminBatchItems} i SET state = 'running', lease_owner = ${workerId}, lease_expires_at = ${new Date(now.getTime() + 120_000)}, lease_token = i.lease_token + 1, attempt_count = i.attempt_count + 1, updated_at = ${now}
        FROM due WHERE i.id = due.id
        RETURNING i.id, i.batch_id, i.target_type, i.target_id, i.expected_version, i.effect_key, i.attempt_count, i.lease_owner, i.lease_token
      ), started AS (
        UPDATE ${adminBatches} b SET state = 'running', updated_at = ${now} WHERE b.id IN (SELECT batch_id FROM claimed) AND b.state = 'queued' RETURNING b.id
      ) SELECT claimed.id AS "itemId", claimed.batch_id AS "batchId", b.operation, b.actor_profile_id AS "actorProfileId", b.selection_snapshot AS "selectionSnapshot", claimed.target_type AS "targetType", claimed.target_id AS "targetId", claimed.expected_version AS "expectedVersion", claimed.effect_key AS "effectKey", claimed.attempt_count AS "attemptCount", claimed.lease_owner AS "leaseOwner", claimed.lease_token AS "leaseToken" FROM claimed JOIN ${adminBatches} b ON b.id = claimed.batch_id`));
      return claimed.map(toClaim);
    },
    async executeClaim(claim, handler: BatchOperationHandler, now) {
      const db = await loadDatabase();
      try {
        return await db.transaction(async (tx) => {
          const current = firstRow(await tx.execute(sql`SELECT i.id, i.state, i.lease_owner AS "leaseOwner", i.lease_token AS "leaseToken", i.lease_expires_at AS "leaseExpiresAt", b.state AS "batchState", p.role AS "actorRole" FROM ${adminBatchItems} i JOIN ${adminBatches} b ON b.id = i.batch_id LEFT JOIN ${profiles} p ON p.id = b.actor_profile_id WHERE i.id = ${claim.itemId}::uuid AND i.batch_id = ${claim.batchId}::uuid FOR UPDATE OF i`));
          if (!current || typeof current !== "object") return "stale" as const;
          const row = z.object({state: z.string(), leaseOwner: z.string().nullable(), leaseToken: z.coerce.number().int(), leaseExpiresAt: z.coerce.date().nullable(), batchState: z.string(), actorRole: z.string().nullable()}).parse(current);
          if (row.state !== "running" || row.leaseOwner !== claim.leaseOwner || row.leaseToken !== claim.leaseToken || !row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= now.getTime() || !["running", "queued", "cancelled"].includes(row.batchState)) return "stale" as const;
          if (row.actorRole !== "staff" && row.actorRole !== "exco" && row.actorRole !== "superadmin") {
            if (!(await settleClaim(tx, claim, {status: "skipped", reasonCode: "ACTOR_REVOKED"}, now))) throw new StaleBatchClaim();
            return "settled" as const;
          }
          const actor = {kind: row.actorRole, userId: claim.actorProfileId, profileId: claim.actorProfileId} as const;
          const outcome = await handler.execute(actor, claim, tx);
          if (!(await settleClaim(tx, claim, outcome, now))) throw new StaleBatchClaim();
          return "settled" as const;
        });
      } catch (error) {
        if (error instanceof StaleBatchClaim) return "stale";
        // The business transaction rolled back. Record only a retryable diagnostic in a new fenced transaction.
        return db.transaction(async (tx) => {
          const settled = await settleClaim(tx, claim, {status: "retryable", errorCode: "TRANSIENT_HANDLER_ERROR"}, now);
          return settled ? "settled" as const : "stale" as const;
        });
      }
    },
  };
}
export const adminBatchWorkerRepository = createAdminBatchWorkerRepository();
