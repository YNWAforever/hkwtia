// @vitest-environment node
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
const state=vi.hoisted(()=>({database:null as Awaited<ReturnType<typeof isolatedAuditDatabase>>["database"]|null}));
// Replace only the connection loader and explicitly synthetic policy registry.
// Applications, membership writes, authorization, consent receipts and journeys are real.
vi.mock("@/lib/db/repos/common",async original=>({...await original<typeof import("@/lib/db/repos/common")>(),getDb:async()=>{if(!state.database)throw Error("DISPOSABLE_DB_NOT_READY");return state.database;}}));
vi.mock("@/config/membership-policies",async()=>({MEMBERSHIP_POLICIES:[JSON.parse(readFileSync("tests/fixtures/synthetic-membership-policy.json","utf8"))]}));
import {resumeOrStartJoin} from "@/lib/membership/join-service";
import {completeApplication} from "@/lib/membership/onboarding";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {membershipPolicyAcceptancesRepository} from "@/lib/db/repos/membership-policy-acceptances";
import {jobsRepository} from "@/lib/db/repos/jobs";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {membershipsRepository} from "@/lib/db/repos/memberships";
let f:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const member={kind:"member",profileId:"t14b-member",userId:"t14b-auth"} as const;
const other={kind:"member",profileId:"t14b-other",userId:"t14b-other-auth"} as const;
const profile={id:member.profileId,displayName:"Synthetic T14B Member",locale:"zh-HK"};
const count=async(table:"memberships"|"billing_attempts"|"messages")=>Number((await f.pool.query("SELECT count(*) AS n FROM "+table)).rows[0].n);
async function start(plan:"community"|"patron"|"startup"|"corporate"="community") {return resumeOrStartJoin(member,{plan});}
async function accept(applicationId:string) {return membershipPolicyAcceptancesRepository.recordPolicyAcceptance(member,{applicationId,policyVersion:"synthetic-browser-test"});}
async function ownedCompany() {const id=randomUUID();await f.pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic T14B Limited','Synthetic T14B Company')",[id]);await f.pool.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,'owner')",[id,member.profileId]);return {id,legalName:"Synthetic T14B Limited",displayName:"Synthetic T14B Company"};}
async function checkoutCommand():Promise<WebhookLifecycleCommand> {
 const company=await ownedCompany(),a=await start("corporate");await accept(a.applicationId);
 const result=await completeApplication(member,{plan:"corporate",applicationId:a.applicationId,billingInterval:"annual",profile,company});
 const suffix=randomUUID().replaceAll("-","");
 await f.pool.query("INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state,stripe_checkout_session_id) VALUES($1,1,$2,'price_synthetic_t14b_corporate','active',$3)",[result.membershipId,"t14b-"+suffix,"cs_synthetic_"+suffix]);
 return {eventId:"evt_synthetic_checkout_"+suffix,eventType:"checkout.session.completed",eventCreated:1760000000,membershipId:result.membershipId!,applicationId:a.applicationId,planCode:"corporate",stripeCustomerId:"cus_synthetic_"+suffix,stripeSubscriptionId:"sub_synthetic_"+suffix,stripeCheckoutSessionId:"cs_synthetic_"+suffix,nextStatus:"active",billingPeriodStart:new Date("2026-10-01T00:00:00Z"),billingPeriodEnd:new Date("2027-10-01T00:00:00Z"),cancelAtPeriodEnd:false,isRenewal:false};
}
const system={kind:"system",userId:null,source:"stripe-webhook"} as const;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION!=="1")("membership join lifecycle through real disposable PostgreSQL repositories",()=>{
 beforeAll(async()=>{f=await isolatedAuditDatabase();state.database=f.database;},120000);
 afterAll(async()=>{vi.unstubAllEnvs();state.database=null;if(f)await f.close();},60000);
 beforeEach(async()=>{
  vi.stubEnv("MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED","true");vi.stubEnv("MEMBERSHIP_POLICY_ACTIVE_VERSION","synthetic-browser-test");
  vi.stubEnv("STRIPE_STARTUP_PRICE_ID","price_synthetic_t14b_startup");vi.stubEnv("STRIPE_CORPORATE_PRICE_ID","price_synthetic_t14b_corporate");
  await f.pool.query("TRUNCATE profiles,companies CASCADE");
  await f.pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$2,'member@t14b.example.test','Synthetic T14B Member','member'),($3,$4,'other@t14b.example.test','Synthetic T14B Other','member')",[member.profileId,member.userId,other.profileId,other.userId]);
 });
 it("starting and interrupt/resume preserve profile identity and create no membership or payment",async()=>{
  const a=await start();expect(await start()).toEqual(a);expect(await resumeOrStartJoin(member,{plan:"community",applicationId:a.applicationId})).toEqual(a);
  expect((await f.pool.query("SELECT auth_user_id,display_name FROM profiles WHERE id=$1",[member.profileId])).rows).toEqual([{auth_user_id:member.userId,display_name:profile.displayName}]);
  expect((await applicationsRepository.getById(member,a.applicationId))?.status).toBe("draft");expect(await count("memberships")).toBe(0);expect(await count("billing_attempts")).toBe(0);
 });
 it("eight concurrent starts create one actor-owned draft",async()=>{const rows=await Promise.all(Array.from({length:8},()=>start()));expect(new Set(rows.map(r=>r.applicationId)).size).toBe(1);expect((await f.pool.query("SELECT count(*)::int AS n FROM membership_applications")).rows).toEqual([{n:1}]);});
 it("foreign and company-co-member identities cannot resume or submit another applicant's join",async()=>{
  const a=await start();await expect(resumeOrStartJoin(other,{plan:"community",applicationId:a.applicationId})).rejects.toThrow("FORBIDDEN");
  await expect(completeApplication(other,{plan:"community",applicationId:a.applicationId,billingInterval:"none",profile:{id:other.profileId,displayName:"Other"}})).rejects.toThrow("FORBIDDEN");
  const company=await ownedCompany();await f.pool.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,'member')",[company.id,other.profileId]);
  const shared=await resumeOrStartJoin(member,{plan:"corporate",companyId:company.id});
  await expect(resumeOrStartJoin(other,{plan:"corporate",applicationId:shared.applicationId,companyId:company.id})).rejects.toThrow("APPLICATION_NOT_FOUND");
  await expect(completeApplication(other,{plan:"corporate",applicationId:shared.applicationId,billingInterval:"annual",company,profile:{id:other.profileId,displayName:"Other"}})).rejects.toThrow("APPLICATION_NOT_FOUND");
  expect(await count("memberships")).toBe(0);
 });
 it("unconfirmed policy consent prevents entitlement creation and pending-policy submission is recoverable",async()=>{
  const a=await start();const input={plan:"community",applicationId:a.applicationId,billingInterval:"none",profile};
  await expect(completeApplication(member,input)).rejects.toThrow("MEMBERSHIP_POLICY_ACCEPTANCE_REQUIRED");expect(await count("memberships")).toBe(0);expect((await applicationsRepository.getById(member,a.applicationId))?.status).toBe("draft");
  await accept(a.applicationId);expect(await completeApplication(member,input)).toMatchObject({next:"complete"});
 });
 it("parallel consent confirmations record one immutable actor/policy-version receipt",async()=>{
  const a=await start();await Promise.all(Array.from({length:8},()=>accept(a.applicationId)));
  expect((await f.pool.query("SELECT actor_user_id,metadata->>'policyVersion' AS version FROM audit_events WHERE action='membership.policy.accepted' AND target_id=$1",[a.applicationId])).rows).toEqual([{actor_user_id:member.profileId,version:"synthetic-browser-test"}]);
 });
 it("duplicate completion creates one free entitlement and unique onboarding steps without sending",async()=>{
  const a=await start();await accept(a.applicationId);const input={plan:"community",applicationId:a.applicationId,billingInterval:"none",profile};
  const results=await Promise.all(Array.from({length:8},()=>completeApplication(member,input)));expect(new Set(results.map(r=>r.membershipId)).size).toBe(1);expect(results.every(r=>r.next==="complete")).toBe(true);
  expect(await count("memberships")).toBe(1);expect(await count("billing_attempts")).toBe(0);expect(await count("messages")).toBe(0);
  const steps=(await f.pool.query("SELECT step,status FROM journey_state WHERE membership_id=$1",[results[0].membershipId])).rows;expect(steps.length).toBeGreaterThan(0);expect(new Set(steps.map(r=>r.step)).size).toBe(steps.length);expect(steps.every(r=>r.status==="scheduled")).toBe(true);
  expect((await applicationsRepository.getById(member,a.applicationId))?.status).toBe("completed");
 });
 it.each(["startup","corporate"] as const)("%s submission creates only one unpaid company membership; repeat submit never creates a checkout attempt",async plan=>{
  const company=await ownedCompany(),a=await start(plan);await accept(a.applicationId);const input={plan,applicationId:a.applicationId,billingInterval:"annual",profile,company};
  const results=await Promise.all(Array.from({length:6},()=>completeApplication(member,input)));expect(new Set(results.map(r=>r.membershipId)).size).toBe(1);expect(results.every(r=>r.next==="checkout")).toBe(true);
  const row=await membershipsRepository.getByApplicationId(member,a.applicationId);expect(row).toMatchObject({status:"pending_payment",companyId:company.id,ownerUserId:null,planCode:plan,billingInterval:"annual",stripeCustomerId:null,stripeSubscriptionId:null});
  expect(await count("memberships")).toBe(1);expect(await count("billing_attempts")).toBe(0);expect(await count("messages")).toBe(0);expect((await f.pool.query("SELECT count(*)::int AS n FROM journey_state")).rows).toEqual([{n:0}]);
 });
 it("review-tier submission stays pending_review and cannot skip approval or produce checkout",async()=>{
  const a=await start("patron");await accept(a.applicationId);const input={plan:"patron",applicationId:a.applicationId,billingInterval:"none",profile};const results=await Promise.all(Array.from({length:6},()=>completeApplication(member,input)));
  expect(results.every(r=>r.next==="review"&&!r.checkout)).toBe(true);expect(await count("memberships")).toBe(1);expect((await membershipsRepository.getByApplicationId(member,a.applicationId))?.status).toBe("pending_review");expect(await count("billing_attempts")).toBe(0);
 });
 it("unsupported monthly mapping, missing company and a revoked company membership fail closed without entitlement",async()=>{
  const company=await ownedCompany(),a=await start("corporate");await accept(a.applicationId);
  await expect(completeApplication(member,{plan:"corporate",applicationId:a.applicationId,billingInterval:"monthly",profile,company})).rejects.toThrow("UNSUPPORTED_BILLING_INTERVAL");
  await expect(completeApplication(member,{plan:"corporate",applicationId:a.applicationId,billingInterval:"annual",profile})).rejects.toThrow("COMPANY_REQUIRED");
  await f.pool.query("UPDATE company_members SET revoked_at=now() WHERE company_id=$1",[company.id]);
  await expect(completeApplication(member,{plan:"corporate",applicationId:a.applicationId,billingInterval:"annual",profile,company})).rejects.toThrow("FORBIDDEN");expect(await count("memberships")).toBe(0);expect(await count("billing_attempts")).toBe(0);
 });

 it("correlated checkout delivered twice activates the original membership exactly once",async()=>{
  const command=await checkoutCommand();const results=await Promise.all([jobsRepository.processWebhookLifecycle(system,command),jobsRepository.processWebhookLifecycle(system,command)]);
  expect(results.sort()).toEqual(["duplicate","processed"]);expect(await count("memberships")).toBe(1);
  expect((await membershipsRepository.getById(member,command.membershipId))?.status).toBe("active");
  expect((await f.pool.query("SELECT state FROM billing_attempts WHERE membership_id=$1",[command.membershipId])).rows).toEqual([{state:"completed"}]);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='stripe.webhook.processed'",[command.membershipId])).rows).toEqual([{n:1}]);
 });
 it("older renewal payment events cannot roll back periods or manufacture renewal engagement",async()=>{
  const command=await checkoutCommand();await jobsRepository.processWebhookLifecycle(system,command);
  const renewal:WebhookLifecycleCommand={...command,eventId:"evt_synthetic_renewal_"+randomUUID(),eventType:"invoice.paid",eventCreated:1760001000,stripeCheckoutSessionId:null,billingPeriodStart:new Date("2027-10-01T00:00:00Z"),billingPeriodEnd:new Date("2028-10-01T00:00:00Z"),isRenewal:true};
  expect(await jobsRepository.processWebhookLifecycle(system,renewal)).toBe("processed");
  const before=(await f.pool.query("SELECT status,billing_period_start,billing_period_end FROM memberships WHERE id=$1",[command.membershipId])).rows;
  const stale:WebhookLifecycleCommand={...renewal,eventId:"evt_synthetic_old_"+randomUUID(),eventType:"invoice.payment_failed",eventCreated:1760000010,nextStatus:"past_due",billingPeriodStart:command.billingPeriodStart,billingPeriodEnd:command.billingPeriodEnd};
  expect(await jobsRepository.processWebhookLifecycle(system,stale)).toBe("processed");
  expect((await f.pool.query("SELECT status,billing_period_start,billing_period_end FROM memberships WHERE id=$1",[command.membershipId])).rows).toEqual(before);
  expect((await f.pool.query("SELECT type,metadata->>'periodStart' AS period_start FROM engagement_events WHERE metadata->>'membershipId'=$1 ORDER BY occurred_at",[command.membershipId])).rows).toEqual([{type:"renewal_paid",period_start:renewal.billingPeriodStart!.toISOString()}]);
  expect((await f.pool.query("SELECT action FROM audit_events WHERE request_id=$1",[stale.eventId])).rows).toEqual([{action:"stripe.webhook.ignored_stale"}]);
 });
 it("a mid-renewal SQL failure rolls back entitlement, engagement and audit; one same-key retry recovers",async()=>{
  const command=await checkoutCommand();await jobsRepository.processWebhookLifecycle(system,command);
  const renewal:WebhookLifecycleCommand={...command,eventId:"evt_synthetic_fault_"+randomUUID(),eventType:"invoice.paid",eventCreated:1760001000,stripeCheckoutSessionId:null,billingPeriodStart:new Date("2027-10-01T00:00:00Z"),billingPeriodEnd:new Date("2028-10-01T00:00:00Z"),isRenewal:true};
  const before=(await f.pool.query("SELECT status,billing_period_start,billing_period_end FROM memberships WHERE id=$1",[command.membershipId])).rows;
  // Fault injection is confined to this newly created loopback database.
  await f.pool.query("CREATE FUNCTION t14b_renewal_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_RENEWAL_WRITE_FAILURE'; END $$; CREATE TRIGGER t14b_renewal_fault BEFORE INSERT ON engagement_events FOR EACH ROW EXECUTE FUNCTION t14b_renewal_fault()");
  try{await expect(jobsRepository.processWebhookLifecycle(system,renewal)).rejects.toThrow();}finally{await f.pool.query("DROP TRIGGER t14b_renewal_fault ON engagement_events; DROP FUNCTION t14b_renewal_fault()");}
  expect((await f.pool.query("SELECT status,billing_period_start,billing_period_end FROM memberships WHERE id=$1",[command.membershipId])).rows).toEqual(before);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM engagement_events WHERE metadata->>'membershipId'=$1",[command.membershipId])).rows).toEqual([{n:0}]);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE request_id=$1",[renewal.eventId])).rows).toEqual([{n:0}]);
  expect((await f.pool.query("SELECT state FROM jobs WHERE run_key=$1",[renewal.eventId])).rows).toEqual([{state:"failed"}]);
  expect(await jobsRepository.processWebhookLifecycle(system,renewal)).toBe("processed");expect(await jobsRepository.processWebhookLifecycle(system,renewal)).toBe("duplicate");
  expect((await f.pool.query("SELECT status,billing_period_start,billing_period_end FROM memberships WHERE id=$1",[command.membershipId])).rows).toEqual([{status:"active",billing_period_start:renewal.billingPeriodStart,billing_period_end:renewal.billingPeriodEnd}]);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM engagement_events WHERE metadata->>'membershipId'=$1",[command.membershipId])).rows).toEqual([{n:1}]);
 });
});
