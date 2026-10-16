import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const root = {kind: "superadmin", userId: "root", profileId: "root"} as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("policy-gated bulk grants on disposable PostgreSQL", () => {
  beforeAll(async () => {vi.stubEnv("ADMIN_BATCH_ENABLED", "true"); fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {vi.unstubAllEnvs(); if (fixture) await fixture.close();}, 40_000);
  it("previews concrete targets, blocks existing memberships and commits only eligible profiles", async () => {
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "membership_grant", idempotencyKey: randomUUID(), targets: [{kind: "profile", profileId: "grant-c"}, {kind: "profile", profileId: "a"}, {kind: "company", companyId: "11111111-1111-4111-8111-111111111111"}], payload: {planCode: "corporate", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z", reason: "Approved test scholarship"}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(root, request, batchPreviewDigest(request));
    process.env.MEMBERSHIP_GRANTS_ENABLED = "true";
    process.env.MEMBERSHIP_GRANT_BATCH_ENABLED = "true";
    try {
      expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
      const preview = await batches.preview(root, batchId);
      expect(preview).toMatchObject({total: 3, eligible: 1, blocked: 2});
      expect(Object.fromEntries(preview.items.map((row) => [row.target.id, row.reasonCode]))).toEqual({"grant-c": null, "a": "MEMBERSHIP_ALREADY_EXISTS", "11111111-1111-4111-8111-111111111111": "GRANT_COMPANY_POLICY_UNAPPROVED"});
      await batches.commit(root, batchId, preview.digest);
      const claims = await worker.claimItems("grant-worker", now, 10);
      expect(claims).toHaveLength(1);
      expect(await worker.executeClaim(claims[0]!, batchOperationHandlers.membership_grant!, now)).toBe("settled");
      const final = await batches.preview(root, batchId);
      expect(final.counters.succeeded).toBe(1);
      const grant = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id='grant-c' AND grant_reason IS NOT NULL");
      expect(grant.rows[0]?.n).toBe(1);
    } finally {delete process.env.MEMBERSHIP_GRANTS_ENABLED; delete process.env.MEMBERSHIP_GRANT_BATCH_ENABLED;}
  }, 60_000);
  it("previews and executes company targets through the same gated grant service", async () => {
    const companyId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await fixture.pool.query("INSERT INTO companies (id,display_name) VALUES ($1,'Synthetic Bulk Company')", [companyId]);
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "membership_grant", idempotencyKey: randomUUID(), targets: [{kind: "company", companyId}], payload: {planCode: "startup", effectiveAt: "2040-01-01T00:00:00.000Z", expiresAt: "2041-01-01T00:00:00.000Z", reason: "Synthetic approved batch grant"}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(root, request, batchPreviewDigest(request));
    process.env.MEMBERSHIP_GRANTS_ENABLED = "true";
    process.env.MEMBERSHIP_GRANT_BATCH_ENABLED = "true";
    process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED = "true";
    try {
      await worker.prepareNext(batchOperationHandlers, now);
      const preview = await batches.preview(root, batchId);
      expect(preview).toMatchObject({total: 1, eligible: 1, blocked: 0});
      expect(preview.items[0]?.after).toMatchObject({seatLimit: 3, planCode: "startup"});
      await batches.commit(root, batchId, preview.digest);
      const claims = await worker.claimItems("company-grant-worker", now, 10);
      expect(claims).toHaveLength(1);
      expect(await worker.executeClaim(claims[0]!, batchOperationHandlers.membership_grant!, now)).toBe("settled");
      expect((await batches.preview(root, batchId)).counters.succeeded).toBe(1);
      expect((await fixture.pool.query("SELECT company_id,owner_user_id,seat_limit FROM memberships WHERE company_id=$1", [companyId])).rows).toEqual([{company_id: companyId, owner_user_id: null, seat_limit: 3}]);
    } finally {delete process.env.MEMBERSHIP_GRANTS_ENABLED; delete process.env.MEMBERSHIP_GRANT_BATCH_ENABLED; delete process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED;}
  }, 60_000);  it("skips a company grant when its capability is disabled after preview", async () => {
    const companyId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await fixture.pool.query("INSERT INTO companies (id,display_name) VALUES ($1,'Disabled Synthetic Company')", [companyId]);
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "membership_grant", idempotencyKey: randomUUID(), targets: [{kind: "company", companyId}], payload: {planCode: "startup", effectiveAt: "2040-01-01T00:00:00.000Z", expiresAt: "2041-01-01T00:00:00.000Z", reason: "Synthetic batch grant only"}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    process.env.MEMBERSHIP_GRANTS_ENABLED = "true"; process.env.MEMBERSHIP_GRANT_BATCH_ENABLED = "true"; process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED = "true";
    try {
      const {batchId} = await batches.create(root, request, batchPreviewDigest(request));
      await worker.prepareNext(batchOperationHandlers, now);
      const preview = await batches.preview(root, batchId);
      expect(preview.eligible).toBe(1);
      await batches.commit(root, batchId, preview.digest);
      delete process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED;
      const [claim] = await worker.claimItems("disabled-company-worker", now, 1);
      expect(await worker.executeClaim(claim!, batchOperationHandlers.membership_grant!, now)).toBe("settled");
      expect((await batches.preview(root, batchId)).counters.skipped).toBe(1);
      expect((await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE company_id=$1", [companyId])).rows[0]?.n).toBe(0);
      expect((await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.created' AND metadata->>'targetId'=$1", [companyId])).rows[0]?.n).toBe(0);
    } finally {delete process.env.MEMBERSHIP_GRANTS_ENABLED; delete process.env.MEMBERSHIP_GRANT_BATCH_ENABLED; delete process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED;}
  }, 60_000);});
