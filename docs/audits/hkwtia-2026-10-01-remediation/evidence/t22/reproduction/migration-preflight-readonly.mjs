import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
const host = new URL(process.env.DATABASE_URL).hostname;
if(host !== 'ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech' || process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST) throw Error('ISOLATED_TARGET_REQUIRED');
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await client.connect();
 const result = await client.query(await readFile('docs/audits/hkwtia-2026-10-01-remediation/evidence/t23/migration-preflight.sql','utf8'));
 const rows = result.flatMap(x=>x.rows ?? []);
 const readOnly=rows.some(x=>x.read_only===true);
 const duplicate=Number(rows.find(x=>'conflicting_renewal_episode_groups' in x)?.conflicting_renewal_episode_groups);
 const pending=Number(rows.find(x=>'pending_refund_orders' in x)?.pending_refund_orders);
 if(!readOnly || duplicate!==0 || !Number.isSafeInteger(pending)) throw Error('PREFLIGHT_MISMATCH');
 const receipt={observedAt:new Date().toISOString(),sourceSha:process.env.AUDIT_SOURCE_SHA,environment:'confirmed isolated G0 Neon ledger56; exact target guard',command:'node .playwright/t22-run-isolated.mjs .playwright/t23-preflight-readonly.mjs',transactionReadOnly:readOnly,conflictingRenewalEpisodeGroups:duplicate,pendingRefundOrders:pending,financialWrites:0,providerCalls:0,production:false,productionPreflightVerified:false};
 await writeFile('docs/audits/hkwtia-2026-10-01-remediation/evidence/t23/migration-preflight-isolated.json',JSON.stringify(receipt,null,2)+'\n');
 process.stdout.write(JSON.stringify(receipt)+'\n');
} catch {process.stdout.write('ISOLATED_PREFLIGHT_FAILED\n');process.exitCode=1;} finally {await client.end();}
