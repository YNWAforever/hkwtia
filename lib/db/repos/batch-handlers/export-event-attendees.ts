import "server-only";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {batchPreviewDigest,batchRuntimeConfig} from "@/lib/admin/batches/types";
import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {attendeesCsv} from "@/lib/admin/event-attendees";
import {requireAdmin} from "@/lib/auth/authorize";
import {requireAutomationCron,type AutomationRepositoryActor} from "@/lib/auth/automation-actor";
import type {Actor} from "@/lib/membership/lifecycle";
import {getDb} from "@/lib/db/repos/common";
import type {BatchDatabase,BatchExecutor} from "@/lib/db/repos/admin-batches";
import {listEventAttendeePage,type EventAttendee} from "@/lib/db/repos/events";

function exportTtlMs(){return z.coerce.number().int().min(1).max(60).default(30).parse(process.env.EVENT_ATTENDEE_EXPORT_TTL_MINUTES)*60000;}
const loadDefault=async()=>await getDb() as unknown as BatchDatabase;
function rows(result:unknown):unknown[]{return Array.isArray(result)?result:result&&typeof result==='object'&&'rows' in result&&Array.isArray(result.rows)?result.rows:[];}
/** Reuse the exact door-list projection and search. Only the worker reads all bounded pages. */
async function readSnapshot(actor:Actor,eventId:string,search:string,tx:BatchExecutor){
  const result:EventAttendee[]=[];let cursor:string|null=null;
  do{
    const page=await listEventAttendeePage(actor,eventId,{search,cursor,limit:50},{loadDatabase:async()=>({execute:query=>tx.execute(query),transaction:async work=>work(tx)})});
    if(!page)throw new Error('EVENT_NOT_FOUND');
    result.push(...page.items);
    if(result.length>batchRuntimeConfig().maxItems)throw new Error('EXPORT_TOO_LARGE');
    cursor=page.nextCursor;
  }while(cursor);
  return result;
}
function digest(rows:readonly EventAttendee[]){
  return batchPreviewDigest(rows.map(row=>({...row,checkedInAt:row.checkedInAt?.toISOString()??null})));
}
export const eventAttendeeExportHandler:BatchOperationHandler={
  async prepare(actor,request,tx){
    requireAdmin(actor);if(request.operation!=='export_event_attendees')throw new Error('BATCH_OPERATION_MISMATCH');
    const target={type:'event' as const,id:request.payload.eventId};
    let snapshot:EventAttendee[]=[];let reasonCode:string|null=null;
    if(process.env.EVENT_ATTENDEE_EXPORT_ENABLED!=='true')reasonCode='EVENT_EXPORT_DISABLED';
    else try{snapshot=await readSnapshot(actor,target.id,request.payload.search,tx);if(!snapshot.length)reasonCode='NO_ATTENDEES';}
    catch(error){if(error instanceof Error&&['EVENT_NOT_FOUND','EXPORT_TOO_LARGE'].includes(error.message))reasonCode=error.message;else throw error;}
    return [{target,previewStatus:reasonCode?'blocked':'eligible',eligible:!reasonCode,reasonCode,expectedVersion:digest(snapshot),before:{rowCount:snapshot.length},after:{rowCount:snapshot.length,search:request.payload.search}}];
  },
  async execute(actor,claim,tx){
    requireAdmin(actor);
    if(claim.operation!=='export_event_attendees'||claim.request.operation!=='export_event_attendees'||claim.target.type!=='event'||claim.target.id!==claim.request.payload.eventId)return {status:'failed',errorCode:'BATCH_OPERATION_MISMATCH'};
    if(process.env.EVENT_ATTENDEE_EXPORT_ENABLED!=='true')return {status:'skipped',reasonCode:'EVENT_EXPORT_DISABLED'};
    let snapshot:EventAttendee[];
    try{snapshot=await readSnapshot(actor,claim.target.id,claim.request.payload.search,tx);}
    catch(error){if(error instanceof Error&&['EVENT_NOT_FOUND','EXPORT_TOO_LARGE'].includes(error.message))return {status:'skipped',reasonCode:error.message};throw error;}
    if(digest(snapshot)!==claim.expectedVersion)return {status:'skipped',reasonCode:'EXPORT_SNAPSHOT_CHANGED'};
    const csv=attendeesCsv(snapshot);if(Buffer.byteLength(csv,'utf8')>10485760)return {status:'failed',errorCode:'EXPORT_TOO_LARGE'};
    await tx.execute(sql`INSERT INTO admin_batch_export_artifacts (batch_id,csv,row_count,expires_at) VALUES (${claim.batchId}::uuid,${csv},${snapshot.length},now()+${exportTtlMs()}*interval '1 millisecond') ON CONFLICT (batch_id) DO NOTHING`);
    await tx.execute(sql`INSERT INTO audit_events (actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES (${actor.profileId},${actor.kind},'event.attendees.export_prepared','event',${claim.target.id},jsonb_build_object('batchId',${claim.batchId}::text,'rowCount',${snapshot.length}::int))`);
    return {status:'succeeded',resultRef:claim.batchId};
  },
};

/** No attendee scan: bytes were prepared atomically by the worker, with a short private lifetime. */
export async function downloadEventAttendeeArtifact(actor:Actor,batchId:string,load:()=>Promise<BatchDatabase>=loadDefault,now=new Date()):Promise<{csv:string;rowCount:number}>{
  requireAdmin(actor);z.string().uuid().parse(batchId);z.date().parse(now);
  if(process.env.EVENT_ATTENDEE_EXPORT_ENABLED!=='true'||process.env.ADMIN_BATCH_ENABLED!=='true')throw new Error('EXPORT_UNAVAILABLE');
  return (await load()).transaction(async tx=>{
    const batch=rows(await tx.execute(sql`SELECT state,operation FROM admin_batches WHERE id=${batchId}::uuid AND actor_profile_id=${actor.profileId}`))[0] as {state:string;operation:string}|undefined;
    if(!batch)throw new Error('BATCH_NOT_FOUND');
    if(batch.operation!=='export_event_attendees'||batch.state!=='completed')throw new Error('EXPORT_INCOMPLETE');
    const raw=rows(await tx.execute(sql`SELECT csv,row_count AS "rowCount",expires_at AS "expiresAt" FROM admin_batch_export_artifacts WHERE batch_id=${batchId}::uuid`))[0];
    if(!raw)throw new Error('EXPORT_EXPIRED');
    const file=z.object({csv:z.string(),rowCount:z.coerce.number().int(),expiresAt:z.coerce.date()}).parse(raw);
    if(file.expiresAt.getTime()<=now.getTime())throw new Error('EXPORT_EXPIRED');
    await tx.execute(sql`INSERT INTO audit_events (actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES (${actor.profileId},${actor.kind},'admin.batch.export_downloaded','admin_batch',${batchId},jsonb_build_object('rowCount',${file.rowCount}::int))`);
    return {csv:file.csv,rowCount:file.rowCount};
  });
}

/** Runs under the existing batch cron; deletes only expired cached files, never batch/audit history. */
export async function cleanupEventAttendeeArtifacts(actor:AutomationRepositoryActor,load:()=>Promise<BatchDatabase>=loadDefault,now=new Date()):Promise<number>{
  requireAutomationCron(actor);z.date().parse(now);
  if(process.env.EVENT_ATTENDEE_EXPORT_ENABLED!=='true')return 0;
  return (await load()).transaction(async tx=>{
    const deleted=rows(await tx.execute(sql`DELETE FROM admin_batch_export_artifacts WHERE batch_id IN (SELECT batch_id FROM admin_batch_export_artifacts WHERE expires_at<=${now} ORDER BY expires_at,batch_id LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING batch_id`));
    if(deleted.length)await tx.execute(sql`INSERT INTO audit_events (actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES (NULL,'system','admin.batch.exports_expired','admin_batch','expired-cache',jsonb_build_object('count',${deleted.length}::int))`);
    return deleted.length;
  });
}

