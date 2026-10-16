import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
const value = process.env.HKWTIA_PRODUCTION_DIAGNOSTIC_URL;
if (!value) throw new Error("Production diagnostic URL unavailable");
const url = new URL(value);
if (url.hostname !== "ep-steep-wind-ao0pbldw.c-2.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") throw new Error("Production target mismatch");
url.searchParams.set("sslmode","verify-full");
const client = new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:15000,statement_timeout:10000,application_name:"hkwtia_readonly_schema_preflight"});
const journal=JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8")).entries;
const receipt={checkedAt:new Date().toISOString(),projectId:"fragrant-mountain-25240574",branchId:"br-noisy-glitter-ao2npd77",branchName:"production",hostname:url.hostname,database:"neondb",vercelBinding:"unverified",readOnly:true};
try {
 await client.connect();
 await client.query("BEGIN READ ONLY");
 await client.query("SET LOCAL statement_timeout = '10s'");
 receipt.session=(await client.query("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only")).rows[0];
 const ledger=(await client.query("SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at")).rows;
 receipt.ledgerRows=ledger.length;
 receipt.latestMigration=ledger.at(-1);
 receipt.ledgerMatches=ledger.map(row=>{
 const entry=journal.find(e=>String(e.when)===String(row.created_at));
 const text=entry ? fs.readFileSync("drizzle/"+entry.tag+".sql","utf8") : "";
 const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
 return {id:row.id,tag:entry?.tag??null,appliedHash:row.hash,hashMatches:!!entry&&digest(text)===row.hash,lfHashMatches:!!entry&&digest(text.replace(/\r\n/g,"\n"))===row.hash,crlfHashMatches:!!entry&&digest(text.replace(/\r\n/g,"\n").replace(/\n/g,"\r\n"))===row.hash};
 });
 const last=Number(ledger.at(-1).created_at);
 receipt.pendingMigrations=journal.filter(e=>e.when>last).map(e=>({tag:e.tag,hash:crypto.createHash("sha256").update(fs.readFileSync("drizzle/"+e.tag+".sql")).digest("hex")}));
 receipt.membershipGrantColumns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' AND column_name LIKE 'grant_%' ORDER BY column_name")).rows;
 receipt.pendingTablePresence=(await client.query("SELECT name, to_regclass('public.' || name)::text AS present FROM unnest($1::text[]) name",[[...new Set(receipt.pendingMigrations.flatMap(e=>Array.from(fs.readFileSync("drizzle/"+e.tag+".sql","utf8").matchAll(/CREATE TABLE \"([^\"]+)\"/g),m=>m[1])))]] )).rows;
 receipt.ticketedEventCount=(await client.query("SELECT count(*)::integer AS count FROM events WHERE registration_mode='ticketed'")).rows[0].count;
 receipt.metricsView=(await client.query("SELECT matviewname FROM pg_matviews WHERE schemaname='public' AND matviewname='aiops_monthly_metrics'")).rows;
 await client.query("SAVEPOINT compatibility_probe");
 try { await client.query("SELECT grant_effective_at, grant_expires_at FROM memberships WHERE false"); receipt.grantProbe={passed:true}; }
 catch(e) {receipt.grantProbe={passed:false,code:e.code};await client.query("ROLLBACK TO SAVEPOINT compatibility_probe");}
 await client.query("ROLLBACK");
 fs.writeFileSync("docs/audits/hkwtia-final-2026-09-27/evidence/production-schema-preflight-2026-09-28.json",JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({checkedAt:receipt.checkedAt,readOnly:receipt.session.read_only,ledgerRows:receipt.ledgerRows,latestId:receipt.latestMigration.id,allLedgerHashesMatch:receipt.ledgerMatches.every(e=>e.hashMatches),pending:receipt.pendingMigrations.map(e=>e.tag),grantProbe:receipt.grantProbe,existingPendingTables:receipt.pendingTablePresence.filter(t=>t.present),ticketedEventCount:receipt.ticketedEventCount,metricsViewPresent:receipt.metricsView.length===1}));
} catch(e) { console.error(JSON.stringify({failed:true,code:e.code??"diagnostic_failed"})); process.exitCode=1; }
finally { await client.end().catch(()=>{}); }
