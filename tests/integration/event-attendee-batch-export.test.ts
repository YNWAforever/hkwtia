import {writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {performance} from "node:perf_hooks";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {createAdminBatchesRepository,createAdminBatchWorkerRepository,type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {batchPreviewDigest,batchRequestSchema} from "@/lib/admin/batches/types";
import {eventAttendeeExportHandler,downloadEventAttendeeArtifact,cleanupEventAttendeeArtifacts} from "@/lib/db/repos/batch-handlers/export-event-attendees";
const enabled=process.env.RUN_POSTGRES_INTEGRATION==='1';
let f:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const eventId=randomUUID(),guestId=randomUUID(),staff={kind:'staff',profileId:'export-staff',userId:'export-staff'} as const;
afterEach(()=>vi.unstubAllEnvs());
describe.skipIf(!enabled)('private background attendee exports',()=>{
 beforeAll(async()=>{f=await isolatedAuditDatabase();await f.pool.query("INSERT INTO profiles (id,auth_user_id,display_name,role) VALUES ('export-staff','export-staff','Synthetic Staff','staff'),('export-member','export-member','=Synthetic Member','member')");await f.pool.query("INSERT INTO events (id,slug,title_en,description_en,starts_at,published,status) VALUES ($1,'synthetic-export','Synthetic','Synthetic','2030-12-31',true,'published')",[eventId]);await f.pool.query("INSERT INTO event_registrations (event_id,profile_id,status) VALUES ($1,'export-member','registered')",[eventId]);await f.pool.query("INSERT INTO event_guest_registrations (id,event_id,name,email,status,cancel_token_digest,idempotency_key) VALUES ($1,$2,'Synthetic Guest','guest@example.test','registered','synthetic-export','synthetic-export')",[guestId,eventId]);},120000);
 afterAll(async()=>{if(f)await f.close();});
 async function prepare(){
  vi.stubEnv('EVENT_ATTENDEE_EXPORT_ENABLED','true');vi.stubEnv('ADMIN_BATCH_ENABLED','true');
  const db=f.database as unknown as BatchDatabase,repo=createAdminBatchesRepository(async()=>db),worker=createAdminBatchWorkerRepository(async()=>db),request=batchRequestSchema.parse({operation:'export_event_attendees',idempotencyKey:randomUUID(),payload:{eventId,search:''}});
  const {batchId}=await repo.create(staff,request,batchPreviewDigest(request));await worker.prepareNext({export_event_attendees:eventAttendeeExportHandler},new Date());
  const preview=await repo.preview(staff,batchId);expect(preview.total).toBe(1);expect(preview.items[0]?.after.rowCount).toBe(2);await repo.commit(staff,batchId,preview.digest);
  return {batchId,repo,worker,db};
 }
 it('builds one private artifact in the worker, downloads without attendee reads and expires it',async()=>{
  const {batchId,repo,worker,db}=await prepare(),now=new Date();
  await expect(downloadEventAttendeeArtifact(staff,batchId,async()=>db,now)).rejects.toThrow('EXPORT_INCOMPLETE');
  const [claim]=await worker.claimItems('test-export',now,1);await worker.executeClaim(claim!,eventAttendeeExportHandler,now);
  expect((await repo.preview(staff,batchId)).state).toBe('completed');
  // Source mutations after materialization cannot silently change an already-created file.
  await f.pool.query("UPDATE profiles SET display_name='Changed after export' WHERE id='export-member'");
  const file=await downloadEventAttendeeArtifact(staff,batchId,async()=>db,now);expect(file.rowCount).toBe(2);expect(file.csv).toContain("'=Synthetic Member");expect(file.csv).not.toContain('Changed after export');
  await expect(downloadEventAttendeeArtifact({...staff,profileId:'someone-else'},batchId,async()=>db,now)).rejects.toThrow('BATCH_NOT_FOUND');
  const later=new Date(now.getTime()+31*60000);await expect(downloadEventAttendeeArtifact(staff,batchId,async()=>db,later)).rejects.toThrow('EXPORT_EXPIRED');
  expect(await cleanupEventAttendeeArtifacts(automationCronActor(),async()=>db,later)).toBe(1);expect(await cleanupEventAttendeeArtifacts(automationCronActor(),async()=>db,later)).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM admin_batch_export_artifacts WHERE batch_id=$1",[batchId])).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM admin_batch_items WHERE batch_id=$1",[batchId])).rows[0].n).toBe(1);
 },60000);
 it('rejects a changed preview and disables materialization when the flag is revoked',async()=>{
  const first=await prepare();await f.pool.query("UPDATE event_guest_registrations SET name='Changed preview' WHERE id=$1",[guestId]);const now=new Date();const [claim]=await first.worker.claimItems('changed-export',now,1);await first.worker.executeClaim(claim!,eventAttendeeExportHandler,now);expect((await first.repo.preview(staff,first.batchId)).items[0]?.reasonCode).toBe('EXPORT_SNAPSHOT_CHANGED');
  const second=await prepare();vi.stubEnv('EVENT_ATTENDEE_EXPORT_ENABLED','false');const [next]=await second.worker.claimItems('disabled-export',new Date(),1);await second.worker.executeClaim(next!,eventAttendeeExportHandler,new Date());expect((await second.repo.preview(staff,second.batchId)).items[0]?.reasonCode).toBe('EVENT_EXPORT_DISABLED');
  expect((await f.pool.query("SELECT count(*)::int AS n FROM admin_batch_export_artifacts")).rows[0].n).toBe(0);
 },60000);
 it('materializes and serves 500 synthetic attendees with fixed snapshot counts',async()=>{
  vi.stubEnv('EVENT_ATTENDEE_EXPORT_ENABLED','true');vi.stubEnv('ADMIN_BATCH_ENABLED','true');
  const id=randomUUID();await f.pool.query("INSERT INTO events (id,slug,title_en,description_en,starts_at,published,status) VALUES ($1,$2,'Synthetic capacity','Synthetic','2030-12-31',true,'published')",[id,'synthetic-'+id]);
  await f.pool.query("INSERT INTO event_guest_registrations (event_id,name,email,status,cancel_token_digest,idempotency_key) SELECT $1::uuid,'Synthetic Guest '||lpad(i::text,3,'0'),'export-load-'||i||'@example.test','registered','digest-'||i,$1::text||'-'||i FROM generate_series(1,500) i",[id]);
  const db=f.database as unknown as BatchDatabase,repo=createAdminBatchesRepository(async()=>db),worker=createAdminBatchWorkerRepository(async()=>db);
  const request=batchRequestSchema.parse({operation:'export_event_attendees',idempotencyKey:randomUUID(),payload:{eventId:id,search:'Synthetic'}});
  const submitStart=performance.now(),{batchId}=await repo.create(staff,request,batchPreviewDigest(request)),submitMs=performance.now()-submitStart;
  const previewStart=performance.now();await worker.prepareNext({export_event_attendees:eventAttendeeExportHandler},new Date());const previewMs=performance.now()-previewStart;
  const preview=await repo.preview(staff,batchId);expect(preview.items[0]?.after.rowCount).toBe(500);await repo.commit(staff,batchId,preview.digest);
  const now=new Date(),[claim]=await worker.claimItems('export-capacity',now,1),executeStart=performance.now();await worker.executeClaim(claim!,eventAttendeeExportHandler,now);const executionMs=performance.now()-executeStart;
  const downloadStart=performance.now(),file=await downloadEventAttendeeArtifact(staff,batchId,async()=>db,now),downloadMs=performance.now()-downloadStart;
  expect(file.rowCount).toBe(500);expect(file.csv.split('\r\n').filter(Boolean)).toHaveLength(501);
  expect((await repo.preview(staff,batchId)).counters).toMatchObject({succeeded:1,failed:0,skipped:0});
  writeFileSync('docs/audits/hkwtia-2026-09-26/evidence/attendee-export-load.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),uncommittedExportCapability:true,generatedAt:new Date().toISOString(),syntheticOnly:true,database:'disposable pgvector/pgvector:pg16',node:process.version,platform:process.platform,rows:500,submitMs,previewMs,executionMs,downloadMs,completed:true},null,2)+'\n');
 },60000);

});
