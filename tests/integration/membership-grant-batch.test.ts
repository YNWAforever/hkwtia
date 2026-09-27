import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const root = {kind: "superadmin", userId: "root", profileId: "root"} as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("policy-gated bulk grants on disposable PostgreSQL", () => {
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});
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
});
