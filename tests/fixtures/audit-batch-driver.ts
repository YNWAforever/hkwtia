import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {z} from "zod";
import type {BatchDatabase} from "@/lib/db/repos/admin-batches";
import {driveAuditBatch,readAuditBatchFacts,seedAuditBatchProfiles} from "./audit-batch-fixture";

async function main(){
  if(process.env.AUDIT_ISOLATED_ACCEPTANCE!=="true"||process.env.AUDIT_BATCH_WORKER_PAUSED!=="true")throw new Error("AUDIT_ISOLATED_PAUSED_WORKER_REQUIRED");
  const connectionString=process.env.DATABASE_URL_TEST;
  if(!connectionString||new URL(connectionString).hostname!==process.env.M2_TEST_NEON_HOST)throw new Error("AUDIT_TEST_DATABASE_ALLOWLIST_REQUIRED");
  const [mode,run,batchId]=process.argv.slice(2);
  z.enum(['seed','prepare','fail','recover','facts']).parse(mode);z.string().uuid().parse(run);
  const pool=new Pool({connectionString});
  try{
    const database=drizzle(pool) as unknown as BatchDatabase;
    const result=mode==='seed'?await seedAuditBatchProfiles(pool,run!):mode==='facts'?await readAuditBatchFacts(pool,run!,z.string().uuid().parse(batchId)):await driveAuditBatch(pool,database,run!,batchId!,mode as 'prepare'|'fail'|'recover');
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
main().catch(()=>{console.error('AUDIT_BATCH_FIXTURE_FAILED: check isolated host, paused worker, exact synthetic scope and migrated schema');process.exitCode=1;});
