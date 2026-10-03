import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {z} from "zod";
import {createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {importCommitBatchHandler} from "@/lib/db/repos/batch-handlers/import-commit";
import {auditBatchIdentity} from "./audit-batch-fixture";
import type {BatchDatabase} from "@/lib/db/repos/admin-batches";
import {driveAuditBatch,readAuditBatchFacts,seedAuditBatchProfiles} from "./audit-batch-fixture";

async function driveImport(pool:Pool,database:BatchDatabase,run:string,batchId:string,mode:string){
  const {ids}=auditBatchIdentity(run),email=`audit-import-${run}@example.test`;
  const batch=(await pool.query("SELECT operation,selection_snapshot FROM admin_batches WHERE id=$1",[batchId])).rows[0];
  if(batch?.operation!=="import_commit")throw new Error("AUDIT_IMPORT_OPERATION_MISMATCH");
  const runId=z.string().uuid().parse(batch.selection_snapshot?.payload?.importRunId);
  const selected=(await pool.query("SELECT validation_status,match_target_id,validated_payload FROM member_import_rows WHERE run_id=$1 AND confirmed=true ORDER BY row_number",[runId])).rows;
  if(selected.length!==2||selected[0]?.validation_status!=="update"||selected[0]?.match_target_id!==ids[0]||selected[1]?.validation_status!=="create"||selected[1]?.validated_payload?.email!==email)throw new Error("AUDIT_IMPORT_SCOPE_MISMATCH");
  if((await pool.query("SELECT count(*)::int AS n FROM admin_batches WHERE state IN ('preparing','queued','running') AND id<>$1",[batchId])).rows[0].n!==0)throw new Error("AUDIT_DATABASE_HAS_OTHER_ACTIVE_BATCHES");
  if(mode==='import-facts'){
    const contacts=(await pool.query("SELECT profile_id,source,whatsapp_opt_in FROM contacts WHERE email=$1",[email])).rows;
    const changes=(await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed' AND metadata->>'runId'=$1",[runId])).rows[0].n;
    const roles=(await pool.query("SELECT count(*)::int AS n FROM profiles WHERE id=ANY($1::text[]) AND role='member' AND auth_user_id=id",[ids])).rows[0].n;
    const memberships=(await pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id=ANY($1::text[])",[ids])).rows[0].n;
    const locale=(await pool.query("SELECT locale FROM profiles WHERE id=$1",[ids[0]])).rows[0].locale;
    return {contactCount:contacts.length,contactOnly:contacts.every(c=>c.profile_id===null&&c.source==='import'&&!c.whatsapp_opt_in),changes,roles,memberships,locale};
  }
  const worker=createAdminBatchWorkerRepository(async()=>database),now=new Date();
  if(mode==='import-prepare')return {prepared:await worker.prepareNext({import_commit:importCommitBatchHandler},now)};
  const claims=await worker.claimItems(`audit-import-${run}`,now,10);
  if(claims.some(c=>c.batchId!==batchId))throw new Error("AUDIT_UNEXPECTED_CLAIM");
  for(const claim of claims)await worker.executeClaim(claim,importCommitBatchHandler,now);
  return {claimed:claims.length};
}
async function main(){
  if(process.env.AUDIT_ISOLATED_ACCEPTANCE!=="true"||process.env.AUDIT_BATCH_WORKER_PAUSED!=="true")throw new Error("AUDIT_ISOLATED_PAUSED_WORKER_REQUIRED");
  const connectionString=process.env.DATABASE_URL_TEST;
  if(!connectionString||new URL(connectionString).hostname!==process.env.M2_TEST_NEON_HOST)throw new Error("AUDIT_TEST_DATABASE_ALLOWLIST_REQUIRED");
  const [mode,run,batchId]=process.argv.slice(2);
  z.enum(['seed','prepare','fail','recover','facts','import-prepare','import-execute','import-facts']).parse(mode);z.string().uuid().parse(run);
  const pool=new Pool({connectionString});
  try{
    const database=drizzle(pool) as unknown as BatchDatabase;
    const result=mode?.startsWith('import-')?await driveImport(pool,database,run!,z.string().uuid().parse(batchId),mode):mode==='seed'?await seedAuditBatchProfiles(pool,run!):mode==='facts'?await readAuditBatchFacts(pool,run!,z.string().uuid().parse(batchId)):await driveAuditBatch(pool,database,run!,batchId!,mode as 'prepare'|'fail'|'recover');
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
main().catch(()=>{console.error('AUDIT_BATCH_FIXTURE_FAILED: check isolated host, paused worker, exact synthetic scope and migrated schema');process.exitCode=1;});
