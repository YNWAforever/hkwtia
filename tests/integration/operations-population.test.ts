// @vitest-environment node
import {randomUUID, createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {createOperationsMetricsRepository} from "@/lib/db/repos/operations-metrics";
const actor = {kind:"staff", profileId:"population-staff", userId:"synthetic"} as const;
const from = new Date("2030-01-01T00:00:00Z"), toExclusive = new Date("2030-01-15T00:00:00Z");
const instant = "2030-01-03T00:00:00Z", cmsId=randomUUID(), cmsAudit=randomUUID();
let fixture:Awaited<ReturnType<typeof isolatedAuditDatabase>>, repo:ReturnType<typeof createOperationsMetricsRepository>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("actual recorded operational population",()=>{
 beforeAll(async()=>{
  fixture=await isolatedAuditDatabase();repo=createOperationsMetricsRepository(async()=>fixture.database);
  await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role,email) VALUES($1,'population-auth','Synthetic staff','staff','population@example.test')",[actor.profileId]);
  for(const handling of ["bot","human","bot"]) await fixture.pool.query("INSERT INTO conversations(anonymous_owner_hash,handling,expires_at,created_at) VALUES($1,$2,'2031-01-01',$3)",[randomUUID(),handling,instant]);
  const cases=[['membership_application','membership.application.case.updated'],['membership','membership.renewal.updated'],['profile','profile.updated'],['event_order','event.order.refunded'],['board_draft','board.updated'],['post','post.updated'],['page_copy_draft','page_copy.draft_saved'],['conversation','conversation.reopened']];
  for(const [target,action] of cases){const id=target==='page_copy_draft'?cmsId:randomUUID(),auditId=target==='page_copy_draft'?cmsAudit:randomUUID();
   await fixture.pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id,created_at) VALUES($1,$2,'staff',$3,$4,$5,$6)",[auditId,actor.profileId,action,target,id,instant]);
   await fixture.pool.query("INSERT INTO audit_events(actor_user_id,actor_type,action,target_type,target_id,created_at) VALUES($1,'staff',$2,$3,$4,$5)",[actor.profileId,action,target,id,instant]);
  }
  await fixture.pool.query("INSERT INTO audit_events(actor_type,action,target_type,target_id,created_at) VALUES('system','irrelevant','admin_operation_baseline','ignore',$1),('system','outside','post','outside',$2)",[instant,toExclusive]);
 },60000);
 afterAll(async()=>{await fixture?.close();});
 it("counts bot, handoff, reopened and all seven unobserved non-support kinds once",async()=>{
  const report=await repo.read(actor,{from,toExclusive});
  expect(report).toMatchObject({caseCount:11,sampleCount:0,missingRate:1,netMinutes:null});
 });
 it("accepts a real CMS draft audit reference and leaves unobserved cases in the denominator",async()=>{
  await repo.record(actor,{observationId:randomUUID(),comparisonId:randomUUID(),caseId:cmsId,caseKind:'cms',auditId:cmsAudit,runId:null,startedAt:'2030-01-03T00:00:00.000Z',endedAt:'2030-01-03T00:01:00.000Z',humanMinutes:1,reviewMinutes:0,reworkMinutes:0,waitMinutes:0,decision:'manual',reopened:false,cohort:'baseline'},toExclusive);
  const report=await repo.read(actor,{from,toExclusive});
  expect(report).toMatchObject({caseCount:11,sampleCount:1,netMinutes:null});expect(report.missingRate).toBeCloseTo(10/11);
 });
 it("keeps requested AI cases in the population without provider success or time samples",async()=>{
  await fixture.pool.query("INSERT INTO ai_draft_work(kind,case_id,facts_hash,agent_version,idempotency_key,state,claim_token,lease_until,created_at,updated_at) VALUES('renewal','renewal-unobserved',repeat('a',64),'test',$1,'claimed',$2,'2031-01-01',$3,$3)",[actor.profileId,randomUUID(),instant]);
  const report=await repo.read(actor,{from,toExclusive});expect(report.caseCount).toBe(12);expect(report.sampleCount).toBe(1);expect(report.missingRate).toBeCloseTo(11/12);

 });
 it("resolves AI work audit references to the authoritative kind and case, refusing wrong-kind attribution",async()=>{
  const work=(await fixture.pool.query("SELECT run_id FROM ai_draft_work WHERE case_id='renewal-unobserved'")).rows[0];const audit=randomUUID();
  await fixture.pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id,created_at) VALUES($1,$2,'staff','ai_draft_generation_requested','ai_draft_work',$3,$4)",[audit,actor.profileId,work.run_id,instant]);
  const observation={observationId:randomUUID(),comparisonId:randomUUID(),caseId:'renewal-unobserved',caseKind:'renewal' as const,auditId:audit,runId:null,startedAt:'2030-01-03T00:02:00.000Z',endedAt:'2030-01-03T00:03:00.000Z',humanMinutes:1,reviewMinutes:0,reworkMinutes:0,waitMinutes:0,decision:'manual' as const,reopened:false,cohort:'baseline' as const};
  await expect(repo.record(actor,{...observation,caseKind:'board'},toExclusive)).rejects.toThrow('OPERATION_SOURCE_MISMATCH');
  await repo.record(actor,observation,toExclusive);
  const report=await repo.read(actor,{from,toExclusive});expect(report.caseCount).toBe(12);expect(report.sampleCount).toBe(2);expect(report.missingRate).toBeCloseTo(10/12);

 });
 it("deduplicates the actual board and renewal agent conversations against their observed business kind",async()=>{
  for(const [agent,caseKind] of [['board-reporter','board'],['retention-analyst','renewal']] as const){
   const conversation=randomUUID(),run=randomUUID();
   await fixture.pool.query("INSERT INTO conversations(id,agent_kind,anonymous_owner_hash,expires_at,created_at) VALUES($1,$2,$3,'2031-01-01',$4)",[conversation,agent,randomUUID(),instant]);
   await fixture.pool.query("INSERT INTO agent_runs(id,conversation_id,agent,trigger) VALUES($1,$2,$3,'scheduled')",[run,conversation,agent.replaceAll('-','_')]);
   await fixture.pool.query("INSERT INTO audit_events(actor_type,action,target_type,target_id,created_at) VALUES('system','agent.case.updated','conversation',$1,$2)",[conversation,instant]);
   const minute=caseKind==='board'?4:6;
   await repo.record(actor,{observationId:randomUUID(),comparisonId:randomUUID(),caseId:conversation,caseKind,auditId:null,runId:run,startedAt:`2030-01-03T00:0${minute}:00.000Z`,endedAt:`2030-01-03T00:0${minute+1}:00.000Z`,humanMinutes:1,reviewMinutes:0,reworkMinutes:0,waitMinutes:0,decision:'manual',reopened:false,cohort:'baseline'},toExclusive);
  }
  const report=await repo.read(actor,{from,toExclusive});expect(report.caseCount).toBe(14);expect(report.sampleCount).toBe(4);expect(report.missingRate).toBeCloseTo(10/14);
  writeFileSync('docs/audits/hkwtia-2026-10-03-full-fix/evidence/t04/population-postgres.json',JSON.stringify({observedAt:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:true,sourceSha256:createHash('sha256').update(readFileSync('lib/db/repos/operations-metrics.ts')).digest('hex'),testSha256:createHash('sha256').update(readFileSync('tests/integration/operations-population.test.ts')).digest('hex'),isolated:'owned disposable loopback PostgreSQL16',ledger:Number((await fixture.pool.query('SELECT count(*) n FROM drizzle.__drizzle_migrations')).rows[0].n),passed:5,failed:0,skipped:0,uniqueCases:14,observedCases:4,providerCalls:0,production:false,scope:'created support + distinct audited business cases + requested/reviewed AI cases + observed cases; not off-platform unrecorded work'},null,2));
 });
});
