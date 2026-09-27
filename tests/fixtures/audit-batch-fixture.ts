import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {z} from "zod";
import {createAdminBatchWorkerRepository,type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";

export function auditBatchIdentity(run: string) {
  z.string().uuid().parse(run);
  return {name:`AuditBatch ${run}`,ids:Array.from({length:10},(_,i)=>`audit-batch-${run}-${i}`)};
}
/** A test-only controlled failure adapter; successful items still use the real domain writer. */
export function auditBatchFailureHandler(ids: readonly string[]): BatchOperationHandler {
  const failures=new Set(ids.slice(8));
  return {...profilePatchBatchHandler,async execute(actor,claim,tx){
    if(failures.has(claim.target.id))return {status:"failed",errorCode:"TRANSIENT_ACCEPTANCE_SINK"};
    return profilePatchBatchHandler.execute(actor,claim,tx);
  }};
}
export async function seedAuditBatchProfiles(pool:Pool,run:string){
  const {name,ids}=auditBatchIdentity(run);
  for(const [i,id] of ids.entries())await pool.query("INSERT INTO profiles (id,auth_user_id,display_name,email,locale) VALUES ($1,$1,$2,$3,'en')",[id,`${name} ${i}`,`${id}@example.test`]);
  return {name,ids};
}
export async function driveAuditBatch(pool:Pool,database:BatchDatabase,run:string,batchId:string,mode:"prepare"|"fail"|"recover"){
  z.string().uuid().parse(batchId);
  const {ids}=auditBatchIdentity(run);
  const batch=(await pool.query("SELECT operation,selection_snapshot FROM admin_batches WHERE id=$1",[batchId])).rows[0];
  const selection=batch?.selection_snapshot?.selection;
  if(batch?.operation!=="profile_patch"||selection?.mode!=="ids"||JSON.stringify([...selection.profileIds].sort())!==JSON.stringify([...ids].sort()))throw new Error("AUDIT_BATCH_SCOPE_MISMATCH");
  // This fixture is only for an isolated database with its scheduled batch worker paused.
  if((await pool.query("SELECT count(*)::int AS n FROM admin_batches WHERE state IN ('preparing','queued','running') AND id<>$1",[batchId])).rows[0].n!==0)throw new Error("AUDIT_DATABASE_HAS_OTHER_ACTIVE_BATCHES");
  const worker=createAdminBatchWorkerRepository(async()=>database),now=new Date();
  if(mode==='prepare')return {prepared:await worker.prepareNext({profile_patch:profilePatchBatchHandler},now)};
  const claims=await worker.claimItems(`audit-browser-${randomUUID()}`,now,10);
  if(claims.some(claim=>claim.batchId!==batchId))throw new Error("AUDIT_UNEXPECTED_CLAIM");
  const handler=mode==='fail'?auditBatchFailureHandler(ids):profilePatchBatchHandler;
  for(const claim of claims)await worker.executeClaim(claim,handler,now);
  return {claimed:claims.length};
}
export async function readAuditBatchFacts(pool:Pool,run:string,batchId:string){
  const {ids}=auditBatchIdentity(run);
  const items=(await pool.query("SELECT target_id,state,attempt_count,effect_key FROM admin_batch_items WHERE batch_id=$1 ORDER BY target_id",[batchId])).rows;
  const effects=(await pool.query("SELECT target_id,count(*)::int AS n FROM audit_events WHERE action='profile.updated' AND target_id=ANY($1::text[]) GROUP BY target_id ORDER BY target_id",[ids])).rows;
  const changed=(await pool.query("SELECT count(*)::int AS n FROM profiles WHERE id=ANY($1::text[]) AND locale='zh-HK'",[ids])).rows[0].n;
  return {items,effects,changed};
}
