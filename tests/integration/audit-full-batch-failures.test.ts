// @vitest-environment node
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { isolatedBatchDatabase } from "./admin-batch-fixture";
import {
  createAdminBatchesRepository,
  createAdminBatchWorkerRepository,
} from "@/lib/db/repos/admin-batches";
import { profilePatchBatchHandler } from "@/lib/admin/batches/handlers/profile-patch";
import { exportMembersBatchHandler } from "@/lib/db/repos/batch-handlers/export-members";
import {
  batchPreviewDigest,
  batchRequestSchema,
} from "@/lib/admin/batches/types";
import { sql } from "drizzle-orm";
import { runAdminBatchJob } from "@/lib/jobs/admin-batch-runner";
const staff = { kind: "staff", profileId: "staff", userId: "staff" } as const;
const now = new Date("2040-04-01T00:00:00.000Z");
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
let store: ReturnType<typeof createAdminBatchesRepository>,
  worker: ReturnType<typeof createAdminBatchWorkerRepository>;
const batches: string[] = [];
async function prepared(ids = ["a"]) {
  const request = batchRequestSchema.parse({
    operation: "profile_patch",
    idempotencyKey: randomUUID(),
    selection: { mode: "ids", profileIds: ids },
    payload: {
      patch: { locale: "zh-HK" },
      reason: "Synthetic member requested language correction",
    },
  });
  const created = await store.create(
    staff,
    request,
    batchPreviewDigest(request),
  );
  batches.push(created.batchId);
  await worker.prepareNext({ profile_patch: profilePatchBatchHandler }, now);
  const preview = await store.preview(staff, created.batchId);
  return { request, preview };
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "batch completion and failure recovery on actual isolated SQL",
  () => {
    beforeAll(async () => {
      fixture = await isolatedBatchDatabase();
      store = createAdminBatchesRepository(
        async () => fixture.database,
        () => now,
      );
      worker = createAdminBatchWorkerRepository(async () => fixture.database);
    }, 60000);
    beforeEach(async () => {
      vi.stubEnv("ADMIN_BATCH_ENABLED", "true");
      await fixture.pool.query(
        "DELETE FROM admin_batch_items WHERE batch_id=ANY($1::uuid[])",
        [batches],
      );
      await fixture.pool.query(
        "DELETE FROM admin_batches WHERE id=ANY($1::uuid[])",
        [batches],
      );
      await fixture.pool.query(
        "UPDATE profiles SET locale='en',updated_at=now() WHERE id IN ('a','b')",
      );
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    it("reports actual running counts immediately after claim", async () => {
      const { preview } = await prepared();
      await store.commit(staff, preview.batchId, preview.digest);
      const claims = await worker.claimItems("synthetic-worker", now, 1);
      expect(claims).toHaveLength(1);
      expect((await store.status(staff, preview.batchId)).counters).toEqual({
        pending: 0,
        running: 1,
        succeeded: 0,
        skipped: 0,
        failed: 0,
      });
    });
    it("surfaces an expired final lease for reconciliation without retrying its effect", async () => {
      const { preview } = await prepared();
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      expect(claim).toBeDefined();
      await fixture.pool.query(
        "UPDATE admin_batch_items SET attempt_count=5,lease_expires_at=$2,result_ref='synthetic-retained-receipt' WHERE id=$1",
        [claim!.itemId, new Date(now.getTime() - 1)],
      );
      expect(await worker.claimItems("recovery-worker", now, 50)).toEqual([]);
      const item = (
        await fixture.pool.query(
          "SELECT state,error_code,effect_key,result_ref,attempt_count FROM admin_batch_items WHERE id=$1",
          [claim!.itemId],
        )
      ).rows[0];
      expect(item).toMatchObject({
        state: "failed",
        error_code: "LEASE_RECOVERY_REQUIRED",
        effect_key: claim!.effectKey,
        result_ref: "synthetic-retained-receipt",
        attempt_count: 5,
      });
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        state: "completed_with_errors",
        counters: { pending: 0, running: 0, failed: 1 },
      });
      await expect(
        store.retryFailedItem(staff, preview.batchId, claim!.target),
      ).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
      expect(
        (await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'"))
          .rows[0].locale,
      ).toBe("en");
    });
    it("expires a terminal preparation error with an audit instead of leaving it preparing forever", async () => {
      vi.stubEnv("ADMIN_BATCH_MAX_ITEMS", "1");
      const request = batchRequestSchema.parse({
        operation: "profile_patch",
        idempotencyKey: randomUUID(),
        selection: { mode: "ids", profileIds: ["a", "b"] },
        payload: {
          patch: { locale: "zh-HK" },
          reason: "Synthetic batch scope verification",
        },
      });
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      batches.push(batchId);
      await expect(
        worker.prepareNext({ profile_patch: profilePatchBatchHandler }, now),
      ).resolves.toBe(true);
      expect(await store.status(staff, batchId)).toMatchObject({
        state: "expired",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT metadata->>'errorCode' AS code FROM audit_events WHERE target_id=$1 AND action='admin.batch.prepare_failed'",
            [batchId],
          )
        ).rows,
      ).toEqual([{ code: "BATCH_TOO_LARGE" }]);
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*) FROM admin_batch_items WHERE batch_id=$1",
            [batchId],
          )
        ).rows[0].count,
      ).toBe("0");
    });
    it("rejects a commit after its operation flag is disabled", async () => {
      vi.stubEnv("MEMBER_EXPORT_ENABLED", "true");
      const request = batchRequestSchema.parse({
        operation: "export_members",
        idempotencyKey: randomUUID(),
        selection: { mode: "ids", profileIds: ["a"] },
        payload: { fields: ["displayName"] },
      });
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      batches.push(batchId);
      await worker.prepareNext(
        { export_members: exportMembersBatchHandler },
        now,
      );
      const preview = await store.preview(staff, batchId);
      vi.stubEnv("MEMBER_EXPORT_ENABLED", "false");
      await expect(
        store.commit(staff, batchId, preview.digest),
      ).rejects.toThrow("BATCH_OPERATION_UNAVAILABLE");
      expect((await store.status(staff, batchId)).state).toBe("ready");
    });
    it("never treats a transient-prefixed uncertain provider outcome as safe to retry", async () => {
      const { preview } = await prepared();
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      await fixture.pool.query(
        "UPDATE admin_batch_items SET state='failed',error_code='TRANSIENT_PROVIDER_ACCEPTANCE_UNCERTAIN',result_ref='synthetic-accepted-receipt',lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",
        [claim!.itemId],
      );
      await fixture.pool.query(
        "UPDATE admin_batches SET state='completed_with_errors',counters=$2::jsonb WHERE id=$1",
        [
          preview.batchId,
          JSON.stringify({
            pending: 0,
            running: 0,
            succeeded: 0,
            skipped: 0,
            failed: 1,
          }),
        ],
      );
      await expect(
        store.retryFailedItem(staff, preview.batchId, claim!.target),
      ).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
      expect(
        (await store.preview(staff, preview.batchId)).retryableFailed,
      ).toBe(false);
      expect(
        (
          await fixture.pool.query(
            "SELECT state,result_ref,effect_key FROM admin_batch_items WHERE id=$1",
            [claim!.itemId],
          )
        ).rows[0],
      ).toMatchObject({
        state: "failed",
        result_ref: "synthetic-accepted-receipt",
        effect_key: claim!.effectKey,
      });
    });
    it("preserves cancel policy: pending is skipped, already leased work may finish, receipts and counts remain", async () => {
      const { preview } = await prepared(["a", "b"]);
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      await store.cancelPending(staff, preview.batchId);
      expect(await worker.claimItems("other-worker", now, 50)).toEqual([]);
      expect(
        await worker.executeClaim(claim!, profilePatchBatchHandler, now),
      ).toBe("settled");
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        state: "cancelled",
        counters: {
          pending: 0,
          running: 0,
          succeeded: 1,
          skipped: 1,
          failed: 0,
        },
      });
    });

    it("reconciles abandoned cancelled work and never starts its effect", async () => {
      const { preview } = await prepared();
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      await store.cancelPending(staff, preview.batchId);
      const later = new Date(now.getTime() + 121000);
      expect(await worker.claimItems("recovery-worker", later, 50)).toEqual([]);
      expect(
        await worker.executeClaim(claim!, profilePatchBatchHandler, later),
      ).toBe("stale");
      expect(
        (await store.preview(staff, preview.batchId)).items[0],
      ).toMatchObject({
        state: "failed",
        errorCode: "CANCELLED_LEASE_RECOVERY_REQUIRED",
        attemptCount: 1,
      });
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        state: "cancelled",
        counters: { failed: 1, running: 0 },
      });
      expect(
        (await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'"))
          .rows[0].locale,
      ).toBe("en");
    });
    it("retries only safe failures and preserves their effect keys and retained receipts", async () => {
      const { preview } = await prepared(["a", "b"]);
      await store.commit(staff, preview.batchId, preview.digest);
      const claims = await worker.claimItems("synthetic-worker", now, 2);
      await fixture.pool.query(
        "UPDATE admin_batch_items SET state='failed',error_code=CASE WHEN target_id='a' THEN 'TRANSIENT_NETWORK' ELSE 'TRANSIENT_ACCEPTED_TIMEOUT' END,result_ref='synthetic-retained',lease_owner=NULL,lease_expires_at=NULL WHERE batch_id=$1",
        [preview.batchId],
      );
      await fixture.pool.query(
        "UPDATE admin_batches SET state='completed_with_errors' WHERE id=$1",
        [preview.batchId],
      );
      await store.retryFailed(staff, preview.batchId);
      const [retry] = await worker.claimItems("retry-worker", now, 50);
      expect(retry?.target.id).toBe("a");
      expect(retry?.effectKey).toBe(
        claims.find((c) => c.target.id === "a")?.effectKey,
      );
      expect(retry?.attemptCount).toBe(2);
      expect(
        (
          await fixture.pool.query(
            "SELECT result_ref FROM admin_batch_items WHERE batch_id=$1 AND target_id='b'",
            [preview.batchId],
          )
        ).rows[0].result_ref,
      ).toBe("synthetic-retained");
      await worker.executeClaim(retry!, profilePatchBatchHandler, now);
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        state: "completed_with_errors",
        counters: { succeeded: 1, failed: 1, pending: 0, running: 0 },
      });
    });
    it("rolls back partial preparation writes before recording a terminal failure", async () => {
      const request = batchRequestSchema.parse({
        operation: "profile_patch",
        idempotencyKey: randomUUID(),
        selection: { mode: "ids", profileIds: ["a"] },
        payload: {
          patch: { locale: "zh-HK" },
          reason: "Synthetic preparation fault",
        },
      });
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      batches.push(batchId);
      await worker.prepareNext(
        {
          profile_patch: {
            prepare: async (_actor, _request, tx) => {
              await tx.execute(
                sql`UPDATE profiles SET locale='zh-HK' WHERE id='a'`,
              );
              throw new Error("BATCH_TOO_LARGE");
            },
            execute: profilePatchBatchHandler.execute,
          },
        },
        now,
      );
      expect(
        (await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'"))
          .rows[0].locale,
      ).toBe("en");
      expect((await store.preview(staff, batchId)).preparationErrorCode).toBe(
        "BATCH_TOO_LARGE",
      );
      expect(
        await worker.prepareNext(
          { profile_patch: profilePatchBatchHandler },
          now,
        ),
      ).toBe(false);
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*) FROM audit_events WHERE action='admin.batch.prepare_failed' AND target_id=$1",
            [batchId],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("does not execute queued work after a flag is disabled; history and cancellation remain available", async () => {
      const { preview } = await prepared(["a", "b"]);
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      vi.stubEnv("ADMIN_BATCH_ENABLED", "false");
      await worker.executeClaim(claim!, profilePatchBatchHandler, now);
      expect(
        (await store.preview(staff, preview.batchId)).items.find(
          (i) => i.target.id === claim!.target.id,
        ),
      ).toMatchObject({
        state: "skipped",
        reasonCode: "BATCH_OPERATION_UNAVAILABLE",
      });
      await store.cancelPending(staff, preview.batchId);
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        state: "cancelled",
        counters: { skipped: 2, succeeded: 0 },
      });
    });
    it("rechecks the stored actor role before performing an effect", async () => {
      const { preview } = await prepared();
      await store.commit(staff, preview.batchId, preview.digest);
      const [claim] = await worker.claimItems("synthetic-worker", now, 1);
      await fixture.pool.query(
        "UPDATE profiles SET role='member' WHERE id='staff'",
      );
      try {
        await worker.executeClaim(claim!, profilePatchBatchHandler, now);
        expect(
          (await store.preview(staff, preview.batchId)).items[0],
        ).toMatchObject({ state: "skipped", reasonCode: "ACTOR_REVOKED" });
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET role='staff' WHERE id='staff'",
        );
      }
      expect(
        (await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'"))
          .rows[0].locale,
      ).toBe("en");
    });
    it("uses actual SQL for bounded worker execution and leaves unstarted work pending without an attempt", async () => {
      const { preview } = await prepared(["a", "b"]);
      await store.commit(staff, preview.batchId, preview.digest);
      let elapsed = 0;
      const result = await runAdminBatchJob(now, {
        repository: {
          ...worker,
          executeClaim: async (...args) => {
            const result = await worker.executeClaim(...args);
            elapsed = 6001;
            return result;
          },
        },
        handlers: { profile_patch: profilePatchBatchHandler },
        clock: () => elapsed,
      });
      expect(result).toEqual({
        claimed: 1,
        settled: 1,
        failed: 0,
        budgetExhausted: true,
      });
      expect(
        (await store.preview(staff, preview.batchId)).items
          .map((i) => [i.state, i.attemptCount])
          .sort(),
      ).toEqual([
        ["pending", 0],
        ["succeeded", 1],
      ]);
      expect(await store.status(staff, preview.batchId)).toMatchObject({
        counters: { pending: 1, succeeded: 1, running: 0 },
      });
    });
    it("keeps preparation idempotency, digest/expiry and actor ownership guards", async () => {
      const { request, preview } = await prepared();
      expect(
        await store.create(staff, request, batchPreviewDigest(request)),
      ).toEqual({ batchId: preview.batchId });
      await expect(
        store.create(staff, request, "different-digest"),
      ).rejects.toThrow("BATCH_IDEMPOTENCY_CONFLICT");
      await expect(
        store.commit(staff, preview.batchId, "0".repeat(64)),
      ).rejects.toThrow("BATCH_PREVIEW_MISMATCH");
      const later = createAdminBatchesRepository(
        async () => fixture.database,
        () => new Date(now.getTime() + 31 * 60000),
      );
      await expect(
        later.commit(staff, preview.batchId, preview.digest),
      ).rejects.toThrow("BATCH_PREVIEW_EXPIRED");
      await expect(
        store.preview(
          { kind: "staff", profileId: "other", userId: "other" },
          preview.batchId,
        ),
      ).rejects.toThrow("BATCH_NOT_FOUND");
    });
  },
);
