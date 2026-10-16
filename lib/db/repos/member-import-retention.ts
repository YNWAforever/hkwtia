import "server-only";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {requireAutomationCron,type AutomationRepositoryActor} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {BatchDatabase} from "@/lib/db/repos/admin-batches";
import {adminBatches,auditEvents,memberImportRows,memberImportRuns,memberImportUploads} from "@/lib/db/server-schema";
function ids(result:unknown):string[]{const rows=Array.isArray(result)?result:result&&typeof result==='object'&&'rows' in result?result.rows:[];return z.array(z.object({id:z.string().uuid()})).parse(rows).map(row=>row.id);}
const array=(values:readonly string[])=>sql`ARRAY[${sql.join(values.map(id=>sql`${id}::uuid`),sql`, `)}]::uuid[]`;
export function createImportRetentionRepository(load:()=>Promise<BatchDatabase>=async()=>await getDb() as unknown as BatchDatabase){return {
  async sweep(actor:AutomationRepositoryActor,now:Date,dryRun=true){
    requireAutomationCron(actor);
    if(process.env.MEMBER_IMPORT_RETENTION_ENABLED!=="true")return {disabled:true,dryRun,uploads:0,runs:0};
    z.date().parse(now);const db=await load();
    return db.transaction(async tx=>{
      // One staging run (<=5000 rows) per invocation; avoid long transactions.
      // Preserve any nonterminal batch. Expired previews can be cancelled by staff before cleanup.
      const runs=ids(await tx.execute(sql`SELECT r.id FROM ${memberImportRuns} r WHERE r.expires_at<=${now} AND r.state<>'expired'
        AND NOT EXISTS (SELECT 1 FROM ${adminBatches} b WHERE b.operation='import_commit' AND b.selection_snapshot->'payload'->>'importRunId'=r.id::text AND b.state IN ('preparing','ready','queued','running'))
        ORDER BY r.expires_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`));
      const uploads=ids(await tx.execute(sql`SELECT id FROM ${memberImportUploads} WHERE expires_at<=${now} AND parsed_snapshot <> '{"headers":[],"rows":[]}'::jsonb ORDER BY expires_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`));
      if(!dryRun){
        if(uploads.length)await tx.execute(sql`UPDATE ${memberImportUploads} SET parsed_snapshot='{"headers":[],"rows":[]}'::jsonb WHERE id=ANY(${array(uploads)})`);
        if(runs.length){
          await tx.execute(sql`UPDATE ${memberImportRows} SET validated_payload='{}'::jsonb,before_snapshot='{}'::jsonb,match_target_id=NULL,expected_version=NULL,conflict_reason=NULL WHERE run_id=ANY(${array(runs)})`);
          await tx.execute(sql`UPDATE ${memberImportRuns} SET state='expired',mapping='{}'::jsonb WHERE id=ANY(${array(runs)})`);
        }
        if(uploads.length||runs.length)await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES (NULL,'system','member.import.retention_scrubbed','member_import_run',${runs[0]??uploads[0]},jsonb_build_object('uploads',${uploads.length}::int,'runs',${runs.length}::int))`);
      }
      return {disabled:false,dryRun,uploads:uploads.length,runs:runs.length};
    });
  },
};}
export const importRetentionRepository=createImportRetentionRepository();
