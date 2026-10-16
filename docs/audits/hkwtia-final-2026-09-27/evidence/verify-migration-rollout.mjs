import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
const stage=process.argv[2];
const targets={"rehearsal-after":"ep-withered-flower-aoaoha9d.c-2.ap-southeast-1.aws.neon.tech","production-before":"ep-steep-wind-ao0pbldw.c-2.ap-southeast-1.aws.neon.tech","production-after":"ep-steep-wind-ao0pbldw.c-2.ap-southeast-1.aws.neon.tech"};
const u=new URL(process.env.HKWTIA_MIGRATION_VERIFY_URL);
if(!targets[stage]||u.hostname!==targets[stage]||u.pathname!=="/neondb")throw new Error("Target mismatch");
u.searchParams.set("sslmode","verify-full");
const c=new pg.Client({connectionString:u.toString(),connectionTimeoutMillis:15000,statement_timeout:10000});
try {
 await c.connect();await c.query("BEGIN READ ONLY");
 const ledger=(await c.query("SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at")).rows;
 const journal=JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8")).entries;
 const pending=journal.filter(e=>e.when>Number(ledger.at(-1).created_at)).map(e=>e.tag);
 const mismatches=ledger.filter(r=>{const e=journal.find(e=>String(e.when)===String(r.created_at));if(!e)return true;const s=fs.readFileSync("drizzle/"+e.tag+".sql","utf8");return ![s,s.replace(/\r\n/g,"\n"),s.replace(/\r\n/g,"\n").replace(/\n/g,"\r\n")].some(v=>crypto.createHash("sha256").update(v).digest("hex")===r.hash);}).map(r=>r.id);
 const counts={};
 for(const t of ["profiles","companies","memberships","events","audit_events"])counts[t]=Number((await c.query('SELECT count(*) AS count FROM "'+t+'"')).rows[0].count);
 const columns=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' AND column_name LIKE 'grant_%' ORDER BY column_name")).rows;
 const constraints=(await c.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('memberships_grant_window_check','rate_limit_buckets_scope_check','rate_limit_buckets_count_check','admin_batches_operation_check') ORDER BY conname")).rows;
 const metricsIndex=(await c.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='aiops_monthly_metrics' AND indexname='aiops_monthly_metrics_month_start_unique'")).rows;
 const receipt={stage,checkedAt:new Date().toISOString(),hostname:u.hostname,database:"neondb",readOnly:true,ledgerRows:ledger.length,latest:ledger.at(-1),pending,unexplainedHashMismatches:mismatches,counts,grantColumns:columns,constraints,metricsUniqueIndexPresent:metricsIndex.length===1};
 if(stage!=="production-before"){
  await c.query("SELECT grant_effective_at,grant_expires_at,grant_reason,grant_actor_profile_id FROM memberships WHERE false");
  receipt.grantProbePassed=true;
  if(ledger.length!==51||pending.length||mismatches.length||columns.length!==4||constraints.length!==4||metricsIndex.length!==1)throw new Error("Verification invariant failed");
 }
 await c.query("ROLLBACK");
 fs.writeFileSync("docs/audits/hkwtia-final-2026-09-27/evidence/migration-"+stage+"-2026-09-28.json",JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt));
}catch(e){console.error(JSON.stringify({failed:true,code:e.code??"verification_failed"}));process.exitCode=1;}finally{await c.end().catch(()=>{});}
