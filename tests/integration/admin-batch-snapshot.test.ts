import {randomUUID} from "node:crypto";

import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {encodeScopedCursor} from "@/lib/admin/pagination";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const other = {kind: "staff", userId: "other", profileId: "other"} as const;
const now = new Date();
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("admin batch snapshot on disposable PostgreSQL", () => {
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("materializes the filtered membership selection once, honors exclusions, and rejects foreign and tampered commits", async () => {
    const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: randomUUID(), selection: {mode: "query", query: {status: ["active"]}, excludedProfileIds: ["b"]}, payload: {patch: {locale: "zh-HK"}, reason: "Member requested a language correction"}});
    const repository = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await repository.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext({profile_patch: profilePatchBatchHandler}, now)).toBe(true);
    await fixture.pool.query("INSERT INTO profiles (id,display_name,email,phone,job_title,locale,role) VALUES ('c','Cam','c@example.test','4','Member','en','member')");
    await fixture.pool.query("INSERT INTO memberships (id,owner_user_id,plan_code,status) VALUES ($1,'c','community','active')", [randomUUID()]);
    const preview = await repository.preview(staff, batchId);
    expect(preview.items.map((item) => item.target.id)).toEqual(["a"]);
    expect(preview.counters.pending).toBe(1);
    await expect(repository.preview(other, batchId)).rejects.toThrow("BATCH_NOT_FOUND");
    await expect(repository.commit(staff, batchId, "a".repeat(64))).rejects.toThrow("BATCH_PREVIEW_MISMATCH");
    expect((await repository.commit(staff, batchId, preview.digest)).state).toBe("queued");
    await expect(repository.commit(staff, batchId, preview.digest)).rejects.toThrow("BATCH_NOT_READY");
  }, 60_000);
  it("reads exact 5000-item totals but only 50 details and detects a retryable failure off-page", async () => {
    const inserted = await fixture.pool.query<{id: string}>(`INSERT INTO admin_batches
      (actor_profile_id, operation, validated_payload, selection_snapshot, idempotency_key,
       request_digest, state, preview_digest, preview_expires_at, counters)
      VALUES ('staff', 'profile_patch', '{}'::jsonb, '{}'::jsonb, $1,
        'synthetic-digest', 'running', $2, now() + interval '1 hour',
        '{"pending":4999,"running":0,"succeeded":0,"skipped":0,"failed":1}'::jsonb)
      RETURNING id`, [randomUUID(), "a".repeat(64)]);
    const batchId = inserted.rows[0]?.id;
    if (!batchId) throw new Error("synthetic batch was not inserted");
    await fixture.pool.query(`INSERT INTO admin_batch_items
      (batch_id, target_type, target_id, expected_version, preview_status,
       state, attempt_count, effect_key, error_code)
      SELECT $1::uuid, 'profile', 'synthetic-' || lpad(n::text, 4, '0'), 'v1',
        CASE WHEN n <= 4990 THEN 'eligible' WHEN n <= 4995 THEN 'skipped' ELSE 'blocked' END,
        CASE WHEN n = 4999 THEN 'failed' ELSE 'pending' END,
        CASE WHEN n = 4999 THEN 1 ELSE 0 END,
        'synthetic-effect:' || $1::text || ':' || n,
        CASE WHEN n = 4999 THEN 'TRANSIENT_PROVIDER' ELSE null END
      FROM generate_series(1, 5000) AS n`, [batchId]);
    const repository = createAdminBatchesRepository(async () => fixture.database, () => now);
    const first = await repository.preview(staff, batchId);
    expect(first).toMatchObject({total: 5000, eligible: 4990, skipped: 5, blocked: 5, retryableFailed: true});
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await repository.preview(staff, batchId, first.nextCursor);
    expect(second.items).toHaveLength(50);
    expect(new Set([...first.items, ...second.items].map(item => item.target.id)).size).toBe(100);
    const last = await repository.preview(staff, batchId, encodeScopedCursor(`admin-batch:${batchId}`, ["profile", "synthetic-4950", ""]));
    expect(last.items).toHaveLength(50);
    expect(last.nextCursor).toBeNull();
    expect(last.items.at(-1)?.target.id).toBe("synthetic-5000");
    expect((await repository.status(staff, batchId)).counters.failed).toBe(1);
    const failed = await repository.preview(staff, batchId, null, "failed");
    expect(failed.items.map((item) => item.target.id)).toEqual(["synthetic-4999"]);
    expect(failed.nextCursor).toBeNull();
    await expect(repository.preview(staff, batchId, first.nextCursor, "failed")).rejects.toThrow("INVALID_CURSOR");
    await expect(repository.preview(other, batchId)).rejects.toThrow("BATCH_NOT_FOUND");
  }, 60_000);
  it("retries only one actor-owned transient item without changing effect keys or uncertain outcomes", async () => {
    const inserted = await fixture.pool.query<{id: string}>(`INSERT INTO admin_batches
      (actor_profile_id, operation, validated_payload, selection_snapshot, idempotency_key,
       request_digest, state, counters)
      VALUES ('staff', 'profile_patch', '{}'::jsonb, '{}'::jsonb, $1,
        'synthetic-digest', 'completed_with_errors',
        '{"pending":0,"running":0,"succeeded":0,"skipped":0,"failed":3}'::jsonb)
      RETURNING id`, [randomUUID()]);
    const batchId = inserted.rows[0]?.id;
    if (!batchId) throw new Error("synthetic batch was not inserted");
    for (const [targetId, errorCode] of [["transient-a", "TRANSIENT_NETWORK"], ["uncertain-b", "PROVIDER_ACCEPTANCE_UNCERTAIN"], ["permanent-c", "PERMANENT_VALIDATION"]]) {
      await fixture.pool.query(`INSERT INTO admin_batch_items
        (batch_id, target_type, target_id, expected_version, preview_status, state, attempt_count, effect_key, error_code)
        VALUES ($1, 'profile', $2, 'v1', 'eligible', 'failed', 1, $3, $4)`, [batchId, targetId, `stable-effect:${targetId}`, errorCode]);
    }
    const repository = createAdminBatchesRepository(async () => fixture.database, () => now);
    await expect(repository.retryFailedItem(other, batchId, {type: "profile", id: "transient-a"})).rejects.toThrow("BATCH_NOT_FOUND");
    await expect(repository.retryFailedItem(staff, batchId, {type: "profile", id: "uncertain-b"})).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
    await expect(repository.retryFailedItem(staff, batchId, {type: "profile", id: "permanent-c"})).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
    expect((await repository.retryFailedItem(staff, batchId, {type: "profile", id: "transient-a"})).state).toBe("queued");
    const items = await fixture.pool.query<{target_id: string; state: string; error_code: string | null; effect_key: string; attempt_count: number}>(
      "SELECT target_id,state,error_code,effect_key,attempt_count FROM admin_batch_items WHERE batch_id=$1 ORDER BY target_id", [batchId]);
    expect(items.rows).toEqual([
      {target_id: "permanent-c", state: "failed", error_code: "PERMANENT_VALIDATION", effect_key: "stable-effect:permanent-c", attempt_count: 1},
      {target_id: "transient-a", state: "pending", error_code: null, effect_key: "stable-effect:transient-a", attempt_count: 1},
      {target_id: "uncertain-b", state: "failed", error_code: "PROVIDER_ACCEPTANCE_UNCERTAIN", effect_key: "stable-effect:uncertain-b", attempt_count: 1},
    ]);
    expect((await repository.status(staff, batchId)).counters).toMatchObject({pending: 1, failed: 2});
    const audit = await fixture.pool.query("SELECT action FROM audit_events WHERE metadata->>'batchId'=$1 AND action='admin.batch.item.retry_requested'", [batchId]);
    expect(audit.rowCount).toBe(1);
  }, 60_000);
});
