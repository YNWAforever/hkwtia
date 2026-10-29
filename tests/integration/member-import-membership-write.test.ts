import {afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createMemberImportRepository} from "@/lib/db/repos/member-imports";
import {ensureImportedMembership} from "@/lib/db/repos/batch-handlers/import-membership-write";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

const csv = `Email,Name,Tier,Status,Expiry,Renew,Join,Legacy
ada.active@example.test,Ada,Individual,active,2027-04-30,2027-04-30,2026-05-01,IN10001
bea.active@example.test,Bea,Corporate,active,2027-04-30,2027-04-30,,
cy.active@example.test,Cy,Platinum,active,2027-09-30,2027-09-30,,
dee.lapsed@example.test,Dee,Corporate,expired,2024-04-30,2024-04-30,,
eve.former@example.test,Eve,Individual,former,,,,
finn.noauth@example.test,Finn,Platinum,no-auth,,,,
gia.associate@example.test,Gia,Associate,active,,,,
hal.bad@example.test,Hal,Gold,active,2027-04-30,,,
`;
const mapping = {email: "Email", displayName: "Name", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry", renewAt: "Renew", joinedAt: "Join", legacyMemberId: "Legacy"};

async function commitRun(runId: string, now: Date) {
  const request = batchRequestSchema.parse({operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: runId}});
  const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
  const worker = createAdminBatchWorkerRepository(async () => fixture.database);
  const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
  expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
  const preview = await batches.preview(staff, batchId);
  await batches.commit(staff, batchId, preview.digest);
  const claims = await worker.claimItems("import-membership-worker", now, 20);
  for (const claim of claims) expect(await worker.executeClaim(claim, batchOperationHandlers.import_commit!, now)).toBe("settled");
  return {batches, batchId, preview};
}

describe.skipIf(!enabled)("member import membership writes on disposable PostgreSQL", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_BATCH_ENABLED", "true");
    vi.stubEnv("MEMBER_IMPORT_ENABLED", "true");
    vi.stubEnv("MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => vi.unstubAllEnvs());
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("dry-runs the synthetic register and commits memberships without Stripe, mail, or legacy profile ids", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z");
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const upload = await repo.upload(staff, new TextEncoder().encode(csv), "csv");
    const staged = await repo.validate(staff, upload.uploadId, mapping);
    expect(staged).toMatchObject({total: 8, create: 6, wouldCreateMembership: 3, wouldSetExpired: 1, contactOnly: 2, skipped: 2, invalid: 0, conflict: 0});
    await repo.confirm(staff, staged.runId, [2, 3, 4, 5, 6, 7]);
    const {batches, batchId} = await commitRun(staged.runId, now);
    expect(await batches.preview(staff, batchId)).toMatchObject({state: "completed", counters: {succeeded: 6, failed: 0}});
    const runState = await fixture.pool.query("SELECT state FROM member_import_runs WHERE id=$1", [staged.runId]);
    expect(runState.rows[0]?.state).toBe("committed");

    const ada = await fixture.pool.query("SELECT id, auth_user_id, directory_visible FROM profiles WHERE email='ada.active@example.test'");
    expect(ada.rows).toHaveLength(1);
    expect(ada.rows[0]?.id).not.toBe("IN10001");
    expect(ada.rows[0]?.id).toBe(ada.rows[0]?.auth_user_id);
    expect(ada.rows[0]?.directory_visible).toBe(false);
    const adaMembership = await fixture.pool.query("SELECT plan_code, status, to_char(billing_period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS start, to_char(billing_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS end, stripe_customer_id, stripe_subscription_id, seat_limit FROM memberships WHERE owner_user_id=$1", [ada.rows[0]?.id]);
    expect(adaMembership.rows).toEqual([{plan_code: "individual", status: "active", start: "2026-05-01", end: "2027-04-30", stripe_customer_id: null, stripe_subscription_id: null, seat_limit: 1}]);
    const adaContact = await fixture.pool.query("SELECT profile_id, source, stage FROM contacts WHERE email='ada.active@example.test'");
    expect(adaContact.rows).toEqual([{profile_id: ada.rows[0]?.id, source: "import", stage: "member"}]);

    const corporate = await fixture.pool.query("SELECT m.plan_code, m.seat_limit, m.stripe_customer_id FROM memberships m JOIN profiles p ON p.id=m.owner_user_id WHERE p.email='bea.active@example.test'");
    expect(corporate.rows).toEqual([{plan_code: "corporate", seat_limit: 12, stripe_customer_id: null}]);
    const platinum = await fixture.pool.query("SELECT m.plan_code, m.seat_limit FROM memberships m JOIN profiles p ON p.id=m.owner_user_id WHERE p.email='cy.active@example.test'");
    expect(platinum.rows).toEqual([{plan_code: "platinum", seat_limit: 25}]);
    const expired = await fixture.pool.query("SELECT m.status, c.stage, c.profile_id IS NOT NULL AS linked FROM memberships m JOIN profiles p ON p.id=m.owner_user_id JOIN contacts c ON c.profile_id=p.id WHERE p.email='dee.lapsed@example.test'");
    expect(expired.rows).toEqual([{status: "expired", stage: "closed", linked: true}]);
    const former = await fixture.pool.query("SELECT c.profile_id, c.stage, (SELECT count(*)::int FROM memberships m JOIN profiles p ON p.email=c.email AND m.owner_user_id=p.id) AS memberships FROM contacts c WHERE c.email IN ('eve.former@example.test','finn.noauth@example.test') ORDER BY c.email");
    expect(former.rows).toEqual([{profile_id: null, stage: "new", memberships: 0}, {profile_id: null, stage: "new", memberships: 0}]);
    const skipped = await fixture.pool.query("SELECT count(*)::int AS n FROM contacts WHERE email IN ('gia.associate@example.test','hal.bad@example.test')");
    expect(skipped.rows[0]?.n).toBe(0);

    const audit = await fixture.pool.query("SELECT metadata->>'outcome' AS outcome, metadata->>'planCode' AS plan, metadata->>'membershipId' IS NOT NULL AS has_membership FROM audit_events WHERE action='member.import.row.committed' AND metadata->>'rowNumber' IN ('2','6','7') ORDER BY (metadata->>'rowNumber')::int");
    expect(audit.rows).toEqual([
      {outcome: "would_create_membership", plan: "individual", has_membership: true},
      {outcome: "contact_only", plan: null, has_membership: false},
      {outcome: "contact_only", plan: null, has_membership: false},
    ]);

    const again = await ensureImportedMembership({execute: (query) => fixture.database.execute(query)}, {profileId: String(ada.rows[0]?.id), planCode: "individual", status: "active", seatLimit: 1, billingPeriodStart: "2026-05-01", billingPeriodEnd: "2027-04-30"});
    expect(again.action).toBe("unchanged");
    const count = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id=$1", [ada.rows[0]?.id]);
    expect(count.rows[0]?.n).toBe(1);

    const annotated = csv.split("\n").map((line, index) => index === 0 ? `${line},Note` : line ? `${line},` : line).join("\n");
    const second = await repo.upload(staff, new TextEncoder().encode(annotated), "csv");
    const rerun = await repo.validate(staff, second.uploadId, mapping);
    expect(rerun).toMatchObject({conflict: 0, unchanged: 6, create: 0, wouldCreateMembership: 0, skipped: 2});
    const after = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id=$1", [ada.rows[0]?.id]);
    expect(after.rows[0]?.n).toBe(1);
  }, 60_000);

  it("leaves plan and status as recommendations when the membership flag is off", async () => {
    vi.stubEnv("MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED", "false");
    const now = new Date("2026-10-29T00:00:00.000Z");
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const file = "Email,Name,Tier,Status,Expiry\nflag.off@example.test,Off,Individual,active,2027-04-30\n";
    const upload = await repo.upload(staff, new TextEncoder().encode(file), "csv");
    const staged = await repo.validate(staff, upload.uploadId, {email: "Email", displayName: "Name", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry"});
    expect(staged).toMatchObject({create: 1, wouldCreateMembership: 0, contactOnly: 0, skipped: 0});
    await repo.confirm(staff, staged.runId, [2]);
    await commitRun(staged.runId, now);
    const contact = await fixture.pool.query("SELECT profile_id, source, stage FROM contacts WHERE email='flag.off@example.test'");
    expect(contact.rows).toEqual([{profile_id: null, source: "import", stage: "new"}]);
    const memberships = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships m JOIN profiles p ON p.id=m.owner_user_id WHERE p.email='flag.off@example.test'");
    expect(memberships.rows[0]?.n).toBe(0);
  }, 60_000);

  it("sets an existing member membership to expired in place", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z");
    const before = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id='b'");
    expect(before.rows[0]?.n).toBe(1);
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const file = "Member ID,Email,Tier,Status,Expiry\nb,b@example.test,Corporate,expired,2024-01-01\n";
    const upload = await repo.upload(staff, new TextEncoder().encode(file), "csv");
    const staged = await repo.validate(staff, upload.uploadId, {profileId: "Member ID", email: "Email", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry"});
    expect(staged).toMatchObject({update: 1, wouldSetExpired: 1, wouldCreateMembership: 0});
    await repo.confirm(staff, staged.runId, [2]);
    await commitRun(staged.runId, now);
    const membership = await fixture.pool.query("SELECT plan_code, status, to_char(billing_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS end, stripe_customer_id FROM memberships WHERE owner_user_id='b'");
    expect(membership.rows).toEqual([{plan_code: "corporate", status: "expired", end: "2024-01-01", stripe_customer_id: null}]);
  }, 60_000);

  it("refuses to stage or prepare membership writes in production", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z");
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const file = "Email,Name,Tier,Status,Expiry\nprod.block@example.test,Prod,Individual,active,2027-04-30\n";
    const upload = await repo.upload(staff, new TextEncoder().encode(file), "csv");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(repo.validate(staff, upload.uploadId, mapping)).rejects.toThrow("MEMBERSHIP_WRITE_PRODUCTION_FORBIDDEN");
    vi.stubEnv("VERCEL_ENV", "");
    const staged = await repo.validate(staff, upload.uploadId, {email: "Email", displayName: "Name", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry"});
    await repo.confirm(staff, staged.runId, [2]);
    vi.stubEnv("VERCEL_ENV", "production");
    const request = batchRequestSchema.parse({operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: staged.runId}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview.eligible).toBe(0);
    expect(preview.items[0]?.reasonCode).toBe("MEMBERSHIP_WRITE_PRODUCTION_FORBIDDEN");
    const written = await fixture.pool.query("SELECT count(*)::int AS n FROM contacts WHERE email='prod.block@example.test'");
    expect(written.rows[0]?.n).toBe(0);
  }, 60_000);

  it("leaves the run confirmed when the batch completes with failed items", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z");
    const repo = createMemberImportRepository(async () => fixture.database, () => now);
    const file = "Email,Name,Tier,Status,Expiry\nfail.item@example.test,Fail,Individual,active,2027-04-30\n";
    const upload = await repo.upload(staff, new TextEncoder().encode(file), "csv");
    const staged = await repo.validate(staff, upload.uploadId, {email: "Email", displayName: "Name", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry"});
    await repo.confirm(staff, staged.runId, [2]);
    const request = batchRequestSchema.parse({operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: staged.runId}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    await batches.commit(staff, batchId, preview.digest);
    vi.stubEnv("VERCEL_ENV", "production");
    const claims = await worker.claimItems("import-fail-worker", now, 5);
    for (const claim of claims) expect(await worker.executeClaim(claim, batchOperationHandlers.import_commit!, now)).toBe("settled");
    expect(await batches.preview(staff, batchId)).toMatchObject({state: "completed_with_errors"});
    const runState = await fixture.pool.query("SELECT state FROM member_import_runs WHERE id=$1", [staged.runId]);
    expect(runState.rows[0]?.state).toBe("confirmed");
    const committed = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.committed' AND target_id=$1", [staged.runId]);
    expect(committed.rows[0]?.n).toBe(0);
    const contact = await fixture.pool.query("SELECT count(*)::int AS n FROM contacts WHERE email='fail.item@example.test'");
    expect(contact.rows[0]?.n).toBe(0);
  }, 60_000);
});
