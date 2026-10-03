// @vitest-environment node
import {drizzle} from 'drizzle-orm/node-postgres';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '@/scripts/lib/acceptance-guard';
import {FULL_REMEDIATION_CLOCK,fullRemediationScopes} from '@/tests/fixtures/full-remediation-fixture';
// Only the transport is substituted: the actual production repository builds and executes SQL.
let pool:Pool;
vi.mock('@/lib/db/repos/common',async importOriginal=>({...await importOriginal<object>(),getDb:async()=>drizzle(pool)}));
import {previewSegment} from '@/lib/admin/segments';
const scopes=fullRemediationScopes('00000000-0000-4000-8000-000000001001');
const actor={kind:'staff',userId:'m2-staff',profileId:'m2-staff'} as const;
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED!=='true')('real isolated segment traversal',()=>{
 beforeAll(async()=>{
 const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
 if(new URL(url).hostname!=='ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech'||process.env.NEON_PROJECT_ID!=='solitary-wave-52860119')throw Error('UNCONFIRMED_ISOLATED_TARGET');
 pool=new Pool({connectionString:url});
 await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
 });
 afterAll(async()=>{await pool?.end();});
 for(const [sector,count]of [[scopes.sector51,51],[scopes.sector101,101]]as const){
 it('traverses '+count+' SQL rows once and round trips previous page cursors',async()=>{
 const pages=[];const ids:string[]=[];let cursor:string|null=null;
 do{const result=await previewSegment(actor,{filter:{sector},limit:50,cursor},undefined,FULL_REMEDIATION_CLOCK);
 expect(result.total).toBe(count);expect(result.items.length).toBeLessThanOrEqual(50);
 pages.push({cursor,ids:result.items.map(row=>row.id)});ids.push(...result.items.map(row=>row.id));cursor=result.nextCursor;
 expect(pages.length).toBeLessThanOrEqual(3);
 }while(cursor);
 expect(ids).toHaveLength(count);expect(new Set(ids).size).toBe(count);expect(new Set(ids)).toEqual(new Set(scopes.profileIds.slice(0,count)));
 for(const previous of pages.slice(0,-1).reverse())expect((await previewSegment(actor,{filter:{sector},limit:50,cursor:previous.cursor},undefined,FULL_REMEDIATION_CLOCK)).items.map(row=>row.id)).toEqual(previous.ids);
 },60_000);
 }
 it('restarts an old position against a different actual SQL audience',async()=>{
 const first=await previewSegment(actor,{filter:{sector:scopes.sector101},limit:50},undefined,FULL_REMEDIATION_CLOCK);
 const changed=await previewSegment(actor,{filter:{sector:scopes.sector51},limit:50,cursor:first.nextCursor},undefined,FULL_REMEDIATION_CLOCK);
 expect(changed.total).toBe(51);expect(changed.items.map(row=>row.id)).toEqual(first.items.map(row=>row.id));
 },60_000);
});
