import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {recheckBatchCommunication,listCommunicationTargets} from "@/lib/db/repos/batch-handlers/communication";
import {createCampaignsRepository} from "@/lib/db/repos/campaigns";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository, type BatchDatabase} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const segmentId = randomUUID();
const personal = randomUUID();
const company = randomUUID();
const companyMembership = randomUUID();
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
let database: BatchDatabase;

describe.skipIf(!enabled)("bulk communication eligibility on the complete schema", () => {
  beforeAll(async () => {
    vi.stubEnv("MEMBER_COMMUNICATION_BATCH_ENABLED", "true");
    vi.stubEnv("APP_URL", "https://isolated.example.test");
    fixture = await isolatedAuditDatabase(); database = fixture.database as unknown as BatchDatabase;
    await fixture.pool.query(`INSERT INTO profiles (id,auth_user_id,display_name,email,locale,role,consent_marketing,whatsapp_opt_in,whatsapp_number)
      VALUES ('staff','staff','Staff','staff@example.test','en','staff',false,false,null),
      ('a','a','Ada','a@example.test','en','member',true,true,'+85290000001'),
      ('b','b','Bea','b@example.test','zh-HK','member',true,true,'+85290000002')`);
    await fixture.pool.query("INSERT INTO companies (id,legal_name,display_name) VALUES ($1,'Synthetic Company','Synthetic Company')", [company]);
    await fixture.pool.query("INSERT INTO company_members (company_id,user_id,role) VALUES ($1,'a','owner')", [company]);
    await fixture.pool.query(`INSERT INTO memberships (id,owner_user_id,company_id,plan_code,status,seat_limit,billing_period_end) VALUES
      ($1,'a',null,'startup','active',5,'2030-10-01'),($2,null,$3,'corporate','active',25,'2030-11-01')`, [personal, companyMembership, company]);
    await fixture.pool.query("INSERT INTO memberships (owner_user_id,plan_code,status,seat_limit) VALUES ('b','community','active',1)");
    await fixture.pool.query("INSERT INTO saved_segments (id,owner_profile_id,name_en,filter_version,filters) VALUES ($1,'staff','Synthetic communication scope',2,'{\"profileIds\":[\"a\",\"b\"]}')", [segmentId]);
  }, 120_000);
  afterAll(async () => {vi.unstubAllEnvs(); if (fixture) await fixture.close();}, 50_000);

  it("registers both gated operations instead of rejecting every authorized request", () => {
    expect(batchOperationHandlers).toHaveProperty("renewal_reminder");
    expect(batchOperationHandlers).toHaveProperty("profile_update_invite");
  });
  it("shows exact membership scopes and blocks two renewal scopes for one person in one batch", async () => {
    const targets=await listCommunicationTargets(staff,segmentId,async()=>fixture.database);
    expect(targets.members.map(row=>row.id)).toEqual(["a","b"]);
    expect(targets.renewals.filter(row=>row.name==="Ada").map(row=>row.id).sort()).toEqual([personal,companyMembership].sort());
    const request=batchRequestSchema.parse({operation:"renewal_reminder",idempotencyKey:randomUUID(),membershipIds:[personal,companyMembership],payload:{channel:"email",segmentId}});
    const prepared=await fixture.database.transaction(tx=>batchOperationHandlers.renewal_reminder.prepare(staff,request,tx));
    expect(prepared).toHaveLength(2);
    expect(prepared.every(row=>row.reasonCode==="MULTIPLE_MEMBERSHIPS_SELECTED"&&!row.eligible)).toBe(true);
  });
  it("pins the exact company membership and skips a renewal that changed after preview", async () => {
    const request = batchRequestSchema.parse({operation: "renewal_reminder", idempotencyKey: randomUUID(), membershipIds: [companyMembership], payload: {channel: "email", segmentId}});
    const batches = createAdminBatchesRepository(async () => database);
    const worker = createAdminBatchWorkerRepository(async () => database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    await worker.prepareNext(batchOperationHandlers, new Date());
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({eligible: 1, items: [{target: {type: "membership", id: companyMembership}, before: {profileId: "a", planCode: "corporate", renewalAt: "2030-11-01T00:00:00.000Z"}}]});
    await batches.commit(staff, batchId, preview.digest);
    await fixture.pool.query("UPDATE memberships SET billing_period_end='2031-11-01' WHERE id=$1", [companyMembership]);
    const [claim] = await worker.claimItems("synthetic-worker", new Date(), 50);
    await worker.executeClaim(claim!, batchOperationHandlers.renewal_reminder!, new Date());
    expect((await batches.preview(staff, batchId)).items[0]).toMatchObject({state: "skipped", reasonCode: "COMMUNICATION_CHANGED"});
    expect((await fixture.pool.query("SELECT count(*)::int n FROM campaigns")).rows[0].n).toBe(0);
  });
});

describe.skipIf(!enabled)("communication draft and delivery controls", () => {
  // The shared database above is closed by its suite; this suite has its own complete-schema fixture.
  let db: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
  const segment = randomUUID();
  const membership = randomUUID();
  beforeAll(async () => {
    vi.stubEnv("MEMBER_COMMUNICATION_BATCH_ENABLED", "true"); vi.stubEnv("APP_URL", "https://isolated.example.test");
    db = await isolatedAuditDatabase();
    await db.pool.query(`INSERT INTO profiles (id,auth_user_id,display_name,email,locale,role,consent_marketing,whatsapp_opt_in,whatsapp_number) VALUES
      ('staff','staff','Staff','staff@example.test','en','staff',false,false,null),
      ('reviewer','reviewer','Reviewer','reviewer@example.test','en','staff',false,false,null),
      ('a','a','Ada','a@example.test','en','member',true,true,'+85290000001'),
      ('b','b','Bea','b@example.test','en','member',true,true,'+85290000002')`);
    await db.pool.query("INSERT INTO memberships (id,owner_user_id,plan_code,status,seat_limit,billing_period_end) VALUES ($1,'a','startup','active',5,'2030-10-01')", [membership]);
    await db.pool.query("INSERT INTO memberships (owner_user_id,plan_code,status,seat_limit) VALUES ('b','community','active',1)");
    await db.pool.query("INSERT INTO saved_segments (id,owner_profile_id,name_en,filter_version,filters) VALUES ($1,'staff','Synthetic scope',2,'{\"profileIds\":[\"a\",\"b\"]}')", [segment]);
  }, 120_000);
  afterAll(async () => {vi.unstubAllEnvs(); if (db) await db.close();}, 50_000);
  async function prepare(input: unknown) {
    const database = db.database as unknown as BatchDatabase;
    const request = batchRequestSchema.parse(input);
    const batches = createAdminBatchesRepository(async () => database);
    const worker = createAdminBatchWorkerRepository(async () => database);
    const {batchId} = await batches.create(staff,request,batchPreviewDigest(request));
    await worker.prepareNext(batchOperationHandlers,new Date());
    const preview = await batches.preview(staff,batchId);
    return {request,batches,worker,batchId,preview};
  }
  it("materializes one reviewed campaign, freezes its audience at review, and rechecks consent/language/renewal at send", async () => {
    const run = await prepare({operation:"renewal_reminder",idempotencyKey:randomUUID(),membershipIds:[membership],payload:{channel:"email",segmentId:segment}});
    expect(run.preview.eligible).toBe(1);
    await run.batches.commit(staff,run.batchId,run.preview.digest);
    const [claim] = await run.worker.claimItems("fixture",new Date(),50);
    await run.worker.executeClaim(claim!,batchOperationHandlers.renewal_reminder!,new Date());
    const finished = await run.batches.preview(staff,run.batchId);
    expect(finished.items[0]?.state).toBe("succeeded");
    const campaignId = finished.items[0]!.resultRef!;
    const campaign = (await db.pool.query("SELECT * FROM campaigns WHERE id=$1",[campaignId])).rows[0];
    expect(campaign).toMatchObject({status:"draft",channel:"email",template:"batch-renewal-reminder"});
    const saved = (await db.pool.query("SELECT * FROM campaign_recipients WHERE campaign_id=$1",[campaignId])).rows[0];
    expect(saved.variables.renewalDate).toBe("2030-10-01");
    expect(saved.variables.ctaUrl).toBe("https://isolated.example.test/portal/billing");
    const deliveryClaim = {id:saved.id,campaignId,profileId:"a",locale:"en" as const,variables:saved.variables};
    const check = () => recheckBatchCommunication(automationCronActor(),deliveryClaim,"email",async()=>db.database);
    expect(await check()).toBeNull();
    await db.pool.query("UPDATE profiles SET consent_marketing=false WHERE id='a'");
    expect(await check()).toBe("not_opted_in");
    await db.pool.query("UPDATE profiles SET consent_marketing=true,locale='zh-HK' WHERE id='a'");
    expect(await check()).toBe("COMMUNICATION_CHANGED");
    await db.pool.query("UPDATE profiles SET locale='en' WHERE id='a'");
    await db.pool.query("UPDATE memberships SET billing_period_end='2031-10-01' WHERE id=$1",[membership]);
    expect(await check()).toBe("COMMUNICATION_CHANGED");
    await db.pool.query("UPDATE memberships SET billing_period_end='2030-10-01' WHERE id=$1",[membership]);
    await db.pool.query("INSERT INTO message_suppressions (profile_id,channel,classification,reason_code) VALUES ('a','email','marketing','unsubscribe')");
    expect(await check()).toBe("suppressed");
    await db.pool.query("DELETE FROM message_suppressions WHERE profile_id='a'");
    vi.stubEnv("MEMBER_COMMUNICATION_BATCH_ENABLED","false"); expect(await check()).toBe("COMMUNICATION_DISABLED"); vi.stubEnv("MEMBER_COMMUNICATION_BATCH_ENABLED","true");
    expect(await recheckBatchCommunication(automationCronActor(),{...deliveryClaim,profileId:"b"},"email",async()=>db.database)).toBe("COMMUNICATION_CHANGED");
  });
  it("refuses review while recipients are still being materialized; invitations use the existing authenticated profile flow", async () => {
    const run = await prepare({operation:"profile_update_invite",idempotencyKey:randomUUID(),selection:{mode:"ids",profileIds:["a","b"]},payload:{channel:"email",segmentId:segment}});
    expect(run.preview.eligible).toBe(2);
    await run.batches.commit(staff,run.batchId,run.preview.digest);
    const claims = await run.worker.claimItems("fixture",new Date(),50);
    await run.worker.executeClaim(claims[0]!,batchOperationHandlers.profile_update_invite!,new Date());
    const current = await run.batches.preview(staff,run.batchId);
    const campaignId = current.items.find(item=>item.state==="succeeded")!.resultRef!;
    const campaigns = createCampaignsRepository(async()=>db.database as never);
    await expect(campaigns.transaction(staff,tx=>campaigns.submitForReview(staff,tx,campaignId))).rejects.toThrow();
    await run.worker.executeClaim(claims[1]!,batchOperationHandlers.profile_update_invite!,new Date());
    await campaigns.transaction(staff,tx=>campaigns.submitForReview(staff,tx,campaignId));
    const recipients = (await db.pool.query("SELECT * FROM campaign_recipients WHERE campaign_id=$1",[campaignId])).rows;
    expect(recipients).toHaveLength(2);
    expect(recipients.every(row=>row.variables.ctaUrl==="https://isolated.example.test/portal/profile")).toBe(true);
    expect((await db.pool.query("SELECT status FROM campaigns WHERE id=$1",[campaignId])).rows[0].status).toBe("review");
  });
  it("blocks shared addresses and missing locale templates", async () => {
    await db.pool.query("UPDATE profiles SET email='a@example.test' WHERE id='b'");
    const shared = await prepare({operation:"renewal_reminder",idempotencyKey:randomUUID(),membershipIds:[membership],payload:{channel:"email",segmentId:segment}});
    expect(shared.preview.items[0]).toMatchObject({eligible:false,reasonCode:"SHARED_CONTACT_POINT"});
    await db.pool.query("UPDATE profiles SET email='b@example.test',locale='zh-HK' WHERE id='b'");
    const invite = await prepare({operation:"profile_update_invite",idempotencyKey:randomUUID(),selection:{mode:"ids",profileIds:["b"]},payload:{channel:"whatsapp",segmentId:segment}});
    expect(invite.preview.items[0]).toMatchObject({eligible:false,reasonCode:"template_not_approved"});
    await db.pool.query("UPDATE profiles SET locale='zh-HK' WHERE id='a'");
    const renewal = await prepare({operation:"renewal_reminder",idempotencyKey:randomUUID(),membershipIds:[membership],payload:{channel:"whatsapp",segmentId:segment}});
    expect(renewal.preview.items[0]).toMatchObject({eligible:false,reasonCode:"template_not_approved"});
    await db.pool.query("UPDATE profiles SET locale='en' WHERE id='a'");
  });
});
