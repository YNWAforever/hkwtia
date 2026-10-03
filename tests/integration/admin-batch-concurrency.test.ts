import {randomUUID} from "node:crypto";

import {afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("admin batch lease and settlement on disposable PostgreSQL", () => {
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  beforeEach(() => vi.stubEnv("ADMIN_BATCH_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  it("fences an expired worker and commits one profile update and audit row", async () => {
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: randomUUID(), selection: {mode: "ids", profileIds: ["a"]}, payload: {patch: {locale: "zh-HK"}, reason: "Member requested a language correction"}});
    const repository = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await repository.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext({profile_patch: profilePatchBatchHandler}, now)).toBe(true);
    const preview = await repository.preview(staff, batchId);
    await repository.commit(staff, batchId, preview.digest);
    const [[oldClaim], competing] = await Promise.all([worker.claimItems("worker-one", now, 1), worker.claimItems("worker-two", now, 1)]);
    expect(oldClaim).toBeDefined();
    expect(competing).toEqual([]);
    const reclaimedAt = new Date(now.getTime() + 121_000);
    const [newClaim] = await worker.claimItems("worker-two", reclaimedAt, 1);
    expect(newClaim?.itemId).toBe(oldClaim!.itemId);
    expect(newClaim?.leaseToken).toBe(oldClaim!.leaseToken + 1);
    expect(await worker.executeClaim(oldClaim!, profilePatchBatchHandler, reclaimedAt)).toBe("stale");
    expect(await worker.executeClaim(newClaim!, profilePatchBatchHandler, reclaimedAt)).toBe("settled");
    const member = await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'");
    expect(member.rows[0]?.locale).toBe("zh-HK");
    const audit = await fixture.pool.query("SELECT action FROM audit_events WHERE target_id='a'");
    expect(audit.rows.filter((row) => row.action === "profile.updated")).toHaveLength(1);
    const done = await repository.preview(staff, batchId);
    expect(done.counters).toMatchObject({succeeded: 1, pending: 0, running: 0});
  }, 60_000);
});
