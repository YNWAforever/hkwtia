// @vitest-environment node
import type {Database} from '@/lib/db/repos/common';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {seedHkwtiaFixtures, cleanupHkwtiaFixtures, fixtureManifest} from '@/scripts/acceptance/hkwtia-fixtures';
import {createOwnedApplicationsRepository} from '@/lib/db/repos/owned-applications';

const state = vi.hoisted(()=>({db: null as unknown}));
vi.mock('@/lib/db/repos/common', async importOriginal=>({
  ...await importOriginal<typeof import('@/lib/db/repos/common')>(), getDb: async()=>state.db,
}));
import {applicationsRepository} from '@/lib/db/repos/applications';

const target = process.env.HKWTIA_DB_ACCEPTANCE === '1' ? localAcceptanceTarget() : null;
const manifest = fixtureManifest('t22-06-owned-paging');
const a = {kind:'member' as const,userId:'synthetic-unbound-a',profileId:manifest.profiles[0].id};
const b = {...a,profileId:manifest.profiles[1].id};
const ids = Array.from({length:10000},()=>randomUUID());
let pool: Pool;
const queries: {sql:string;params:unknown[]}[] = [];
const repo = createOwnedApplicationsRepository(async()=>state.db as Database);
const cursor = (data: Record<string,unknown>)=>Buffer.from(JSON.stringify({v:1,scope:'owned-applications',ownerId:a.profileId,time:'2026-10-26T00:00:00.000123Z',id:ids[0],...data})).toString('base64url');

describe.skipIf(!target)('owned paging on verified isolated Neon (synthetic actors)',{timeout:120000},()=>{
  beforeAll(async()=>{
    // Exact-manifest cleanup also recovers rows left by an interrupted setup.
    await cleanupHkwtiaFixtures(target!,manifest);
    await seedHkwtiaFixtures(target!,manifest.runId);
    neonConfig.webSocketConstructor=WebSocket;
    pool=new Pool({connectionString:target!.databaseUrl,connectionTimeoutMillis:15000});
    state.db=drizzle(pool,{logger:{logQuery(sql,params){queries.push({sql,params});}}});
    await pool.query(`INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,updated_at)
      SELECT id,$2,'community','draft','2026-10-26T00:00:00.000123Z'::timestamptz FROM unnest($1::uuid[]) id`,[ids,a.profileId]);
    // A owns a company seat, but that must never grant applicant reads of B's row.
    await pool.query('UPDATE membership_applications SET company_id=$1 WHERE id=$2',[manifest.companyId,manifest.profiles[1].applicationId]);
  },120000);
  afterAll(async()=>{if(pool){
    await pool.query('DELETE FROM membership_applications WHERE id=ANY($1::uuid[]) AND applicant_user_id=$2',[ids,a.profileId]);
    await cleanupHkwtiaFixtures(target!,manifest);
    expect((await pool.query('SELECT id FROM membership_applications WHERE id=ANY($1::uuid[])',[ids])).rowCount).toBe(0);
    await pool.end();
  }});
  it('fetches limit+1 and walks every same-microsecond row exactly once in SQL order',async()=>{
    const expected=(await pool.query('SELECT id FROM membership_applications WHERE applicant_user_id=$1 ORDER BY updated_at DESC,id DESC',[a.profileId])).rows.map(r=>r.id);
    expect(expected).toHaveLength(10001);
    queries.length=0;
    let page=await repo.listOwnedPage(a,{limit:50});
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).not.toBeNull();
    expect(queries[0].params.at(-1)).toBe(51);
    const seen=page.items.map(r=>r.id);
    while(page.nextCursor){page=await repo.listOwnedPage(a,{limit:50,cursor:page.nextCursor});seen.push(...page.items.map(r=>r.id));}
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(10001);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
  it('rejects illegal/foreign cursors before SQL; a fresh request resets to owner first page',async()=>{
    const first=await repo.listOwnedPage(a,{limit:1});
    const before=queries.length;
    for(const token of ['?', 'x'.repeat(3000),cursor({id:'illegal'}),cursor({time:'bad'}),cursor({ownerId:b.profileId})]){
      await expect(repo.listOwnedPage(a,{cursor:token})).rejects.toThrow('INVALID_APPLICATION_PAGE');
    }
    await expect(repo.listOwnedPage(b,{cursor:first.nextCursor!})).rejects.toThrow('INVALID_APPLICATION_PAGE');
    expect(queries).toHaveLength(before);
    expect((await repo.listOwnedPage(a,{limit:1})).items).toEqual(first.items);
  });
  it('detail uses applicant+ID only, rejects illegal UUID without SQL, denies company-seat access',async()=>{
    queries.length=0;
    expect(await repo.getOwnedById(a,'illegal')).toBeNull();
    expect(queries).toHaveLength(0);
    expect((await repo.getOwnedById(a,ids[0]))?.id).toBe(ids[0]);
    expect(await repo.getOwnedById(b,ids[0])).toBeNull();
    expect(await repo.getOwnedById(a,manifest.profiles[1].applicationId!)).toBeNull();
    expect(await repo.getOwnedById(a,randomUUID())).toBeNull();
    for(const q of queries){expect(q.sql).not.toContain('company_members');expect(q.params).toHaveLength(3);expect(q.params.at(-1)).toBe(1);}
  });
  it('keeps legacy join-resume listOwned unbounded, including plan-filtered calls',async()=>{
    expect(await applicationsRepository.listOwned(a)).toHaveLength(10001);
    expect(await applicationsRepository.listOwned(a,'community')).toHaveLength(10001);
    expect(await applicationsRepository.listOwned(a,'startup')).toHaveLength(0);
  });
  it('records actual adapter EXPLAIN ANALYZE rows/buffers for first and deep pages',async()=>{
    const evidence=[];
    for(const input of [{limit:20},{limit:20,cursor:cursor({id:[...ids].sort().reverse()[9000]})}]){
      queries.length=0;
      await repo.listOwnedPage(a,input);
      const q=queries[0];
      const result=await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,q.params);
      const plan=result.rows[0]['QUERY PLAN'][0];
      expect(plan.Plan['Actual Rows']).toBe(21);
      console.info('T22-06 EXPLAIN',JSON.stringify({page:input.cursor?'deep':'first',plan}));
      const samples=[];
      let bytes=0;
      for(let i=0;i<20;i++){
        const start=performance.now();
        const result=await repo.listOwnedPage(a,input);
        samples.push(performance.now()-start);
        bytes=Buffer.byteLength(JSON.stringify(result));
      }
      evidence.push({page:input.cursor?'deep':'first',plan,returnedJsonBytes:bytes,samples:20,p95ClientMs:samples.sort((a,b)=>a-b)[18]});
    }
    writeFileSync('/tmp/t22-06-explain.json',JSON.stringify({ownedRows:10001,tiedMicrosecondRows:10000,evidence},null,2)+'\n');
    for(const {plan} of evidence){
      expect(JSON.stringify(plan)).toContain('membership_applications_owned_page_idx');
      expect(JSON.stringify(plan)).not.toContain('"Node Type":"Sort"');
      expect(JSON.stringify(plan)).not.toMatch(/"Rows Removed by Filter":[1-9]/);
    }
  });
});
