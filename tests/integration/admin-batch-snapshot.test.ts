import {randomUUID} from "node:crypto";

import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";

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
});
