import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("profile operations cleanup on disposable PostgreSQL", () => {
  beforeAll(async () => {vi.stubEnv("ADMIN_BATCH_ENABLED", "true"); fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {vi.unstubAllEnvs(); if (fixture) await fixture.close();});
  it("previews tags and staff owner and writes metadata, profile version and audit atomically", async () => {
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: randomUUID(), selection: {mode: "ids", profileIds: ["a"]}, payload: {patch: {tags: ["outreach"], ownerProfileId: "staff"}, reason: "Operations ownership correction"}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext({profile_patch: profilePatchBatchHandler}, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({eligible: 1, blocked: 0});
    expect(preview.items[0]?.after).toMatchObject({tags: ["outreach"], ownerProfileId: "staff"});
    await batches.commit(staff, batchId, preview.digest);
    const [claim] = await worker.claimItems("profile-worker", now, 1);
    expect(claim).toBeDefined();
    expect(await worker.executeClaim(claim!, profilePatchBatchHandler, now)).toBe("settled");
    const state = await fixture.pool.query("SELECT tags, owner_profile_id FROM member_operations_metadata WHERE profile_id='a'");
    expect(state.rows[0]).toEqual({tags: ["outreach"], owner_profile_id: "staff"});
    const audit = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='profile.updated' AND target_id='a'");
    expect(audit.rows[0]?.n).toBe(1);
  }, 60_000);
  it("skips an owner demoted after preview without metadata or profile audit", async () => {
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: randomUUID(), selection: {mode: "ids", profileIds: ["b"]}, payload: {patch: {ownerProfileId: "root"}, reason: "Operations ownership correction"}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext({profile_patch: profilePatchBatchHandler}, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview.eligible).toBe(1);
    await batches.commit(staff, batchId, preview.digest);
    await fixture.pool.query("UPDATE profiles SET role='member' WHERE id='root'");
    const [claim] = await worker.claimItems("profile-worker", now, 1);
    expect(await worker.executeClaim(claim!, profilePatchBatchHandler, now)).toBe("settled");
    const final = await batches.preview(staff, batchId);
    expect(final.counters.skipped).toBe(1);
    const metadata = await fixture.pool.query("SELECT count(*)::int AS n FROM member_operations_metadata WHERE profile_id='b'");
    expect(metadata.rows[0]?.n).toBe(0);
    const audit = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='profile.updated' AND target_id='b'");
    expect(audit.rows[0]?.n).toBe(0);
  }, 60_000);

});
