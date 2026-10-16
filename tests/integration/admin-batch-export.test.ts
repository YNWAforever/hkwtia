import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {downloadMemberBatchCsv} from "@/lib/admin/batches/export";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("private member export batch on disposable PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    await fixture.pool.query("UPDATE profiles SET display_name=$1 WHERE id=$2", ['=HYPERLINK("https://evil.example")', "a"]);
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});
  it("materializes exact selected profiles and settles each item once", async () => {
    process.env.MEMBER_EXPORT_ENABLED = "true";
    process.env.ADMIN_BATCH_ENABLED = "true";
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "export_members", idempotencyKey: randomUUID(), selection: {mode: "ids", profileIds: ["a", "b"]}, payload: {fields: ["displayName", "email", "locale"]}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({total: 2, eligible: 2});
    await batches.commit(staff, batchId, preview.digest);
    const claims = await worker.claimItems("export-worker", now, 5);
    expect(claims).toHaveLength(2);
    for (const claim of claims) expect(await worker.executeClaim(claim, batchOperationHandlers.export_members!, now)).toBe("settled");
    expect((await batches.preview(staff, batchId)).counters.succeeded).toBe(2);
    const file = await downloadMemberBatchCsv(staff, batchId, async () => fixture.database, now);
    expect(file.rowCount).toBe(2);
    expect(file.csv).toContain("displayName,email,locale\r\n");
    expect(file.csv).toContain("'=HYPERLINK");
    expect(file.csv.split("\r\n").filter(Boolean)).toHaveLength(3);
    await expect(downloadMemberBatchCsv({...staff, profileId: "root", userId: "root"}, batchId, async () => fixture.database, now)).rejects.toThrow("BATCH_NOT_FOUND");
    await expect(downloadMemberBatchCsv(staff, batchId, async () => fixture.database, new Date(now.getTime() + 31 * 60_000))).rejects.toThrow("EXPORT_EXPIRED");

    delete process.env.MEMBER_EXPORT_ENABLED;
    delete process.env.ADMIN_BATCH_ENABLED;
  }, 60_000);
});
