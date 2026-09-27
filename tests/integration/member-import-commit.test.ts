import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createMemberImportRepository} from "@/lib/db/repos/member-imports";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {randomUUID} from "node:crypto";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const other = {kind: "staff", userId: "other", profileId: "other"} as const;
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("member import staging on disposable PostgreSQL", () => {
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("stages only exact-ID updates and new contacts, preserves conflicts, and reuses a matching file run", async () => {
    const now = new Date();
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const csv = new TextEncoder().encode('Member ID,Email,Locale,Name\na,a@example.test,zh-HK,\n,new@example.test,en,New Contact\n,a@example.test,en,Duplicate\n,b@example.test,zh-HK,Existing\n');
    const upload = await repo.upload(staff, csv, "csv");
    expect(upload).toMatchObject({headers: ["Member ID", "Email", "Locale", "Name"], rowCount: 4});
    const mapping = {profileId: "Member ID", email: "Email", locale: "Locale", displayName: "Name"};
    const staged = await repo.validate(staff, upload.uploadId, mapping);
    expect(staged).toMatchObject({total: 4, update: 1, create: 1, duplicate: 1, conflict: 1});
    const details = await repo.read(staff, staged.runId);
    expect(details.rows.map((row) => row.status)).toEqual(["update", "create", "duplicate", "conflict"]);
    await expect(repo.read(other, staged.runId)).rejects.toThrow();
    expect((await repo.confirm(staff, staged.runId, [2, 3])).state).toBe("confirmed");
    const secondUpload = await repo.upload(staff, csv, "csv");
    const rerun = await repo.validate(staff, secondUpload.uploadId, mapping);
    expect(rerun.runId).toBe(staged.runId);
    const count = await fixture.pool.query("SELECT count(*)::int AS n FROM member_import_rows WHERE run_id=$1", [staged.runId]);
    expect(count.rows[0]?.n).toBe(4);
  }, 60_000);

  it("commits confirmed rows through batch items without merging identities or granting a plan", async () => {
    const now = new Date();
    const imports = createMemberImportRepository(async () => fixture.database, () => now);
    const csv = new TextEncoder().encode('Member ID,Email,Locale,Name,Plan\na,a@example.test,zh-HK,,corporate\n,brandnew@example.test,en,Brand New,patron\n');
    const upload = await imports.upload(staff, csv, "csv");
    const run = await imports.validate(staff, upload.uploadId, {profileId: "Member ID", email: "Email", locale: "Locale", displayName: "Name", planCode: "Plan"});
    await imports.confirm(staff, run.runId, [2, 3]);
    const request = batchRequestSchema.parse({operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: run.runId}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({state: "ready", eligible: 2});
    await batches.commit(staff, batchId, preview.digest);
    const claims = await worker.claimItems("import-worker", now, 10);
    expect(claims).toHaveLength(2);
    for (const claim of claims) expect(await worker.executeClaim(claim, batchOperationHandlers.import_commit!, now)).toBe("settled");
    const final = await batches.preview(staff, batchId);
    expect(final).toMatchObject({state: "completed", counters: {succeeded: 2, failed: 0}});
    const profile = await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'");
    expect(profile.rows[0]?.locale).toBe("zh-HK");
    const contacts = await fixture.pool.query("SELECT email,source,profile_id FROM contacts WHERE email='brandnew@example.test'");
    expect(contacts.rows).toEqual([{email: "brandnew@example.test", source: "import", profile_id: null}]);
    const memberships = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id='a'");
    expect(memberships.rows[0]?.n).toBe(1);
    const audit = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed'");
    expect(audit.rows[0]?.n).toBe(2);
  }, 60_000);
  it("skips a profile changed after preview without a mutation or import audit", async () => {
    const now = new Date();
    const imports = createMemberImportRepository(async () => fixture.database, () => now);
    const csv = new TextEncoder().encode("Member ID,Email,Locale\na,a@example.test,en\n");
    const upload = await imports.upload(staff, csv, "csv");
    const run = await imports.validate(staff, upload.uploadId, {profileId: "Member ID", email: "Email", locale: "Locale"});
    expect(run.update).toBe(1);
    await imports.confirm(staff, run.runId, [2]);
    const request = batchRequestSchema.parse({operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: run.runId}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({eligible: 1});
    await batches.commit(staff, batchId, preview.digest);
    await fixture.pool.query("UPDATE profiles SET updated_at = updated_at + interval '1 second' WHERE id='a'");
    const auditBefore = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed'");
    const [claim] = await worker.claimItems("import-worker", now, 1);
    expect(claim).toBeDefined();
    expect(await worker.executeClaim(claim!, batchOperationHandlers.import_commit!, now)).toBe("settled");
    const final = await batches.preview(staff, batchId);
    expect(final.counters.skipped).toBe(1);
    const profile = await fixture.pool.query("SELECT locale FROM profiles WHERE id='a'");
    expect(profile.rows[0]?.locale).toBe("zh-HK");
    const auditAfter = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed'");
    expect(auditAfter.rows[0]?.n).toBe(auditBefore.rows[0]?.n);
  }, 60_000);

});
