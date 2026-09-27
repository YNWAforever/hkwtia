import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {createImportRetentionRepository} from "@/lib/db/repos/member-import-retention";
import {automationCronActor} from "@/lib/auth/automation-actor";
const enabled=process.env.RUN_POSTGRES_INTEGRATION==='1';
let db:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const now=new Date('2030-10-01T00:00:00Z');
afterEach(()=>vi.unstubAllEnvs());
describe.skipIf(!enabled)("private import retention in disposable PostgreSQL",()=>{
 beforeAll(async()=>{db=await isolatedAuditDatabase();await db.pool.query("INSERT INTO profiles (id,auth_user_id,display_name,role,locale) VALUES ('retention-staff','auth-retention','Synthetic','staff','en')");},120000);
 afterAll(async()=>{if(db)await db.close();});
 it("dry runs then scrubs expired payloads, preserves active batch evidence and audit, and is repeatable",async()=>{
  vi.stubEnv('MEMBER_IMPORT_RETENTION_ENABLED','true');const ids=[randomUUID(),randomUUID()];const runs=[randomUUID(),randomUUID()];const batch=randomUUID();
  for(let i=0;i<2;i++){
   await db.pool.query("INSERT INTO member_import_uploads (id,actor_profile_id,file_digest,format,parsed_snapshot,row_count,expires_at) VALUES ($1::uuid,'retention-staff',$1::text,'csv',$2,1,'2030-09-01')",[ids[i],JSON.stringify({headers:['Email'],rows:[{rowNumber:2,cells:{Email:'synthetic@example.test'}}]})]);
   await db.pool.query("INSERT INTO member_import_runs (id,upload_id,actor_profile_id,file_digest,mapping_digest,mapping,state,summary,expires_at) VALUES ($1::uuid,$2::uuid,'retention-staff',$1::text,'map','{}','confirmed','{}','2030-09-30')",[runs[i],ids[i]]);
   await db.pool.query("INSERT INTO member_import_rows (run_id,row_number,validated_payload,before_snapshot,validation_status,confirmed) VALUES ($1,2,$2,$2,'create',true)",[runs[i],JSON.stringify({email:'synthetic@example.test'})]);
  }
  await db.pool.query("INSERT INTO admin_batches (id,actor_profile_id,operation,validated_payload,selection_snapshot,idempotency_key,request_digest,state) VALUES ($1::uuid,'retention-staff','import_commit','{}',$2,$1::text,'digest','queued')",[batch,JSON.stringify({payload:{importRunId:runs[1]}})]);
  const repo=createImportRetentionRepository(async()=>db.database);
  const dry=await repo.sweep(automationCronActor(),now,true);expect(dry).toMatchObject({uploads:2,runs:1,dryRun:true});
  expect((await db.pool.query("SELECT validated_payload FROM member_import_rows WHERE run_id=$1",[runs[0]])).rows[0].validated_payload).toHaveProperty('email');
  expect(await repo.sweep(automationCronActor(),now,false)).toMatchObject({uploads:2,runs:1});
  expect((await db.pool.query("SELECT validated_payload,before_snapshot FROM member_import_rows WHERE run_id=$1",[runs[0]])).rows[0]).toEqual({validated_payload:{},before_snapshot:{}});
  expect((await db.pool.query("SELECT validated_payload FROM member_import_rows WHERE run_id=$1",[runs[1]])).rows[0].validated_payload).toHaveProperty('email');
  expect(await repo.sweep(automationCronActor(),now,false)).toMatchObject({uploads:0,runs:0});
  expect((await db.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.retention_scrubbed'")).rows[0].n).toBe(1);
  await db.pool.query("UPDATE admin_batches SET state='completed' WHERE id=$1",[batch]);
  expect(await repo.sweep(automationCronActor(),now,false)).toMatchObject({uploads:0,runs:1});
 });
});
it("does not load storage while disabled or for an unauthorized actor",async()=>{
 vi.stubEnv('MEMBER_IMPORT_RETENTION_ENABLED','false');const load=vi.fn();const repo=createImportRetentionRepository(load);
 expect(await repo.sweep(automationCronActor(),now,false)).toMatchObject({disabled:true});expect(load).not.toHaveBeenCalled();
 await expect(repo.sweep({kind:'staff',userId:'x',profileId:'x'} as never,now,true)).rejects.toThrow();expect(load).not.toHaveBeenCalled();
});
