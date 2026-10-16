import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {createMemberImportRepository} from "@/lib/db/repos/member-imports";
import {createAdminBatchesRepository,createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest,batchRequestSchema} from "@/lib/admin/batches/types";
const enabled=process.env.RUN_POSTGRES_INTEGRATION==='1'&&process.env.RUN_AUDIT_LOAD==='1';
const staff={kind:'staff',userId:'auth-import-load',profileId:'import-load-staff'} as const;
let db:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
describe.skipIf(!enabled)('5000-row import capacity',()=>{
 beforeAll(async()=>{db=await isolatedAuditDatabase();await db.pool.query("INSERT INTO profiles (id,auth_user_id,display_name,email,role,locale) SELECT 'import-load-'||g,'auth-import-load-'||g,'Synthetic '||g,'import-'||g||'@example.test','member','en' FROM generate_series(1,5000) g");await db.pool.query("INSERT INTO profiles (id,auth_user_id,display_name,role,locale) VALUES ('import-load-staff','auth-import-load','Synthetic Staff','staff','en')");},120000);
 afterAll(async()=>{if(db)await db.close();});
 it('uploads, validates, previews and applies exactly the confirmed synthetic rows',async()=>{
  const report:Record<string,unknown>={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,database:'disposable pgvector/pgvector:pg16',syntheticOnly:true,rows:5000,completed:false};
  const clock=()=>new Date();const start=performance.now();
  try{
   const imports=createMemberImportRepository(async()=>db.database,clock);
   const csv='Member ID,Email,Locale\n'+Array.from({length:5000},(_,i)=>`import-load-${i+1},import-${i+1}@example.test,zh-HK`).join('\n');
   const upload=await imports.upload(staff,new TextEncoder().encode(csv),'csv');
   const run=await imports.validate(staff,upload.uploadId,{profileId:'Member ID',email:'Email',locale:'Locale'});
   expect(run).toMatchObject({total:5000,update:5000,conflict:0,invalid:0});
   await imports.confirm(staff,run.runId,Array.from({length:5000},(_,i)=>i+2));report.stageMs=performance.now()-start;
   const request=batchRequestSchema.parse({operation:'import_commit',idempotencyKey:randomUUID(),payload:{importRunId:run.runId}});
   const batches=createAdminBatchesRepository(async()=>db.database,clock);const worker=createAdminBatchWorkerRepository(async()=>db.database);
   const submitted=performance.now();const {batchId}=await batches.create(staff,request,batchPreviewDigest(request));report.submitMs=performance.now()-submitted;
   await worker.prepareNext(batchOperationHandlers,clock());const preview=await batches.preview(staff,batchId);expect(preview).toMatchObject({total:5000,eligible:5000});
   await batches.commit(staff,batchId,preview.digest);
   let settled=0;const execution=performance.now();
   while(settled<5000){const claims=await worker.claimItems('import-load-worker',clock(),50);expect(claims.length).toBeGreaterThan(0);for(const claim of claims)expect(await worker.executeClaim(claim,batchOperationHandlers.import_commit!,clock())).toBe('settled');settled+=claims.length;if(settled%1000===0)process.stdout.write(`IMPORT_LOAD_${settled}\n`);}
   report.executionMs=performance.now()-execution;
   const final=await batches.preview(staff,batchId);expect(final.counters).toEqual({pending:0,running:0,succeeded:5000,skipped:0,failed:0});report.counters=final.counters;
   expect((await db.pool.query("SELECT count(*)::int AS n FROM profiles WHERE id LIKE 'import-load-%' AND role='member' AND locale='zh-HK'")).rows[0].n).toBe(5000);
   expect((await db.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed'")).rows[0].n).toBe(5000);report.completed=true;
  }finally{writeFileSync('docs/audits/hkwtia-2026-09-26/evidence/import-load.json',JSON.stringify(report,null,2)+'\n');}
 },900000);
});
