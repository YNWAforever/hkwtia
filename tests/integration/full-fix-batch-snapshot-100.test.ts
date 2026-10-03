// @vitest-environment node
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async original => ({...(await original<typeof import("@/lib/db/repos/common")>()), getDb: async () => state.database}));
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository, type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {segmentFilterSchema} from "@/lib/admin/segment-schema";
const actor = {kind: "staff", profileId: "fixed100-staff", userId: "fixed100-auth"} as const;
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const receipt: Record<string, unknown> = {production: false, syntheticOnly: true, providerCalls: 0,
 environment: "owned disposable PostgreSQL16 with all ledger56 migrations; actual batch repositories and communication handler"};
const directory = ".playwright/full-fix-fixed100-" + randomUUID();
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("fixed 100-target renewal draft snapshot", () => {
 beforeAll(async () => {
  fixture = await isolatedAuditDatabase();state.database = fixture.database;
  for (const flag of ["ADMIN_BATCH_ENABLED", "MEMBER_COMMUNICATION_BATCH_ENABLED"]) vi.stubEnv(flag, "true");
  vi.stubEnv("APP_URL", "http://localhost:3450");vi.stubEnv("EMAIL_DELIVERY_MODE", "test");vi.stubEnv("RUN_LIVE_WOZTELL", "0");
  await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES($1,$2,'Synthetic fixed snapshot staff','staff')", [actor.profileId, actor.userId]);
 }, 120000);
 afterAll(async () => {vi.unstubAllEnvs();if (fixture) await fixture.close();});
 it("retains its target snapshot, rechecks consent and changed renewal facts, and commits exactly once", async () => {
  const prefix = "fixed100-" + randomUUID(), segmentId = randomUUID();
  const pool = fixture.pool;
  await pool.query("INSERT INTO profiles(id,auth_user_id,display_name,email,locale,consent_marketing) SELECT $1||':'||lpad(i::text,3,'0'),$1||':auth:'||i,'Synthetic fixed target '||i,$1||'-'||i||'@example.test','en',true FROM generate_series(1,101) i", [prefix]);
  await pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_period_end) SELECT id,'community','active',1,'2040-01-01' FROM profiles WHERE id LIKE $1", [prefix + ":%"]);
  await pool.query("INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES($1,$2,'Synthetic frozen scope',2,'{}')", [segmentId, actor.profileId]);
  const targets = (await pool.query("SELECT id,owner_user_id FROM memberships WHERE owner_user_id LIKE $1 ORDER BY owner_user_id", [prefix + ":%"])) .rows;
  const selected = targets.slice(0,100), unsubscribed = selected.slice(80,90), renewed = selected.slice(90,95), changed = selected.slice(95,100);
  const request = batchRequestSchema.parse({operation: "renewal_reminder", idempotencyKey: randomUUID(), membershipIds: selected.map(row => row.id), payload: {channel: "email", segmentId}});
  const database = fixture.database as unknown as BatchDatabase;
  const batches = createAdminBatchesRepository(async () => database), worker = createAdminBatchWorkerRepository(async () => database);
  const {batchId} = await batches.create(actor, request, batchPreviewDigest(request));
  expect(await worker.prepareNext(batchOperationHandlers, new Date())).toBe(true);
  const preview = await batches.preview(actor, batchId);
  expect(preview).toMatchObject({state: "ready", total: 100, eligible: 100, blocked: 0});
  const before = (await pool.query("SELECT target_id,effect_key FROM admin_batch_items WHERE batch_id=$1 ORDER BY target_id", [batchId])).rows;
  expect(before).toHaveLength(100);
  await pool.query("UPDATE saved_segments SET filters=$2::jsonb WHERE id=$1", [segmentId, JSON.stringify(segmentFilterSchema.parse({companyPlan: ["patron"]}))]);
  await pool.query("UPDATE profiles SET consent_marketing=false WHERE id=ANY($1::text[])", [unsubscribed.map(row => row.owner_user_id)]);
  // These are synthetic already-renewed business facts, not a claim of a real Stripe receipt.
  await pool.query("UPDATE memberships SET billing_period_end='2041-01-01' WHERE id=ANY($1::uuid[])", [renewed.map(row => row.id)]);
  await pool.query("UPDATE profiles SET locale='zh-HK' WHERE id=ANY($1::text[])", [changed.map(row => row.owner_user_id)]);
  const commits = await Promise.allSettled([batches.commit(actor, batchId, preview.digest), batches.commit(actor, batchId, preview.digest)]);
  expect(commits.filter(item => item.status === "fulfilled")).toHaveLength(1);
  expect(commits.filter(item => item.status === "rejected")).toHaveLength(1);
  let claimed = 0;
  while (claimed < 100) {
   const claims = await worker.claimItems("synthetic-fixed100-worker", new Date(), 50);
   expect(claims.length).toBeGreaterThan(0);
   for (const claim of claims) expect(await worker.executeClaim(claim, batchOperationHandlers.renewal_reminder, new Date())).toBe("settled");
   claimed += claims.length;
  }
  const outcome = await batches.status(actor, batchId);
  expect(outcome.counters).toEqual({pending: 0, running: 0, succeeded: 80, skipped: 20, failed: 0});
  const items = (await pool.query("SELECT target_id,effect_key,state,reason_code FROM admin_batch_items WHERE batch_id=$1 ORDER BY target_id", [batchId])).rows;
  expect(items.map(({target_id,effect_key}) => ({target_id,effect_key}))).toEqual(before);
  for (const item of items) {
   if (unsubscribed.some(row => row.id === item.target_id)) expect(item).toMatchObject({state: "skipped", reason_code: "not_opted_in"});
   else if ([...renewed,...changed].some(row => row.id === item.target_id)) expect(item).toMatchObject({state: "skipped", reason_code: "COMMUNICATION_CHANGED"});
   else expect(item.state).toBe("succeeded");
  }
  const recipients = (await pool.query("SELECT r.profile_id,c.status FROM campaign_recipients r JOIN campaigns c ON c.id=r.campaign_id WHERE c.variables_template->>'_batchId'=$1", [batchId])).rows;
  expect(recipients).toHaveLength(80);
  expect(new Set(recipients.map(row => row.profile_id))).toEqual(new Set(selected.slice(0,80).map(row => row.owner_user_id)));
  expect(recipients.every(row => row.status === "draft")).toBe(true);
  expect((await pool.query("SELECT (SELECT count(*) FROM email_log) AS email, (SELECT count(*) FROM whatsapp_log) AS whatsapp")).rows[0]).toEqual({email:"0", whatsapp:"0"});
  Object.assign(receipt, {sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(), passed:true, snapshot:100, drafted:80, skipped:{consent:10,alreadyRenewedFacts:5,changedLocaleVersion:5}, counters:outcome.counters, doubleCommitFulfilled:1,
   targetAndEffectKeysPreserved:true, filterDriftDidNotRetarget:true, providerBoundary:"review-required campaign drafts only; no queue or send; no real payment provider acceptance"});
  mkdirSync(directory,{recursive:true});writeFileSync(directory+"/receipt.json",JSON.stringify(receipt,null,2)+"\n");
  console.log("FIXED100_RECEIPT",directory+"/receipt.json");
 }, 180000);
});
