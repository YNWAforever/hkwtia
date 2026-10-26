// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {describe, expect, it} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {fixtureManifest, seedHkwtiaFixtures, cleanupHkwtiaFixtures} from '@/scripts/acceptance/hkwtia-fixtures';
import {insertOwnedApplications, ownedFixtureTime} from '@/scripts/acceptance/owned-applications-fixture';
import {timingSummary} from '@/scripts/acceptance/db-timing';
import {createOwnedApplicationsRepository} from '@/lib/db/repos/owned-applications';

const target=process.env.HKWTIA_DB_ACCEPTANCE==='1' && process.env.HKWTIA_DB_TIMING==='1' ? localAcceptanceTarget() : null;

describe.skipIf(!target)('UC22-56 isolated DB timing (no Auth/HTTP)',()=>{
  it('measures production readers and verifies exact fixture cleanup',{timeout:600000},async()=>{
    neonConfig.webSocketConstructor=WebSocket;
    const manifest=fixtureManifest(`uc22-56-${randomUUID()}`);
    const actor={kind:'member' as const,userId:'synthetic-unbound',profileId:manifest.profiles[0].id};
    const ids=Array.from({length:10000},()=>randomUUID());
    const makePool=()=>new Pool({connectionString:target!.databaseUrl,connectionTimeoutMillis:15000,max:1});
    const pool=makePool();
    const evidence=[];
    let cleanupVerified=false;
    try {
      await seedHkwtiaFixtures(target!,manifest.runId);
      for(const scale of [1000,10000]) {
        await insertOwnedApplications(pool,actor.profileId,scale===1000?ids.slice(0,1000):ids.slice(1000));
        const ordered=(await pool.query('SELECT id FROM membership_applications WHERE applicant_user_id=$1 ORDER BY updated_at DESC,id DESC',[actor.profileId])).rows.map(r=>r.id as string);
        expect(ordered).toHaveLength(scale+1);
        const boundary=[...ids.slice(0,scale)].sort().reverse()[Math.floor(scale*0.9)];
        const cursor=Buffer.from(JSON.stringify({v:1,scope:'owned-applications',ownerId:actor.profileId,time:ownedFixtureTime,id:boundary})).toString('base64url');
        const queries: {sql:string;params:unknown[]}[]=[];
        const reader=(connection: Pool)=>createOwnedApplicationsRepository(async()=>drizzle(connection,{logger:{logQuery(sql,params){queries.push({sql,params});}}}));
        for(const name of ['first','deep','detail'] as const) {
          const invoke=(repo: ReturnType<typeof reader>)=>name==='detail'?repo.getOwnedById(actor,ids[0]):repo.listOwnedPage(actor,name==='deep'?{cursor}:{});
          const check=(result: Awaited<ReturnType<typeof invoke>>)=>{
            if(result && 'items' in result) {
              expect(result.items.map(r=>r.id)).toEqual(ordered.slice(name==='deep'?ordered.indexOf(boundary)+1:0,(name==='deep'?ordered.indexOf(boundary)+1:0)+20));
              expect(result.items).toHaveLength(20);
              expect(result.nextCursor).not.toBeNull();
            } else expect(result?.id).toBe(ids[0]);
            expect(queries.at(-1)!.params.at(-1)).toBe(name==='detail'?1:21);
          };
          const repo=reader(pool);
          for(let i=0;i<5;i++) check(await invoke(repo));
          const q=queries.at(-1)!;
          const plan=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,q.params)).rows[0]['QUERY PLAN'][0];
          expect(plan.Plan['Actual Rows']).toBe(name==='detail'?1:21);
          for(const condition of ['warm','cold'] as const) {
            const queryMs:number[]=[],connectMs:number[]=[],totalMs:number[]=[],bytes:number[]=[];
            for(let i=0;i<30;i++) {
              const connection=condition==='cold'?makePool():pool;
              const start=performance.now();
              try {
                if(condition==='cold') {const client=await connection.connect();client.release();}
                const connected=performance.now();
                const result=await invoke(condition==='cold'?reader(connection):repo);
                const finished=performance.now();
                queryMs.push(finished-connected);connectMs.push(connected-start);totalMs.push(finished-start);
                bytes.push(Buffer.byteLength(JSON.stringify(result)));
                check(result);
              } finally {if(condition==='cold') await connection.end();}
            }
            evidence.push({scale,ownedRows:scale+1,name,condition,query:timingSummary(queryMs),connect:timingSummary(connectMs),total:timingSummary(totalMs),bytes:{min:Math.min(...bytes),max:Math.max(...bytes)},queryMs,connectMs,totalMs,plan});
          }
          queries.length=0;
        }
      }
    } finally {
      try {
        await pool.query('DELETE FROM membership_applications WHERE id=ANY($1::uuid[]) AND applicant_user_id=$2',[ids,actor.profileId]);
        await cleanupHkwtiaFixtures(target!,manifest);
        expect((await pool.query('SELECT id FROM membership_applications WHERE id=ANY($1::uuid[])',[[...ids,...manifest.profiles.flatMap(p=>p.applicationId?[p.applicationId]:[])]])).rowCount).toBe(0);
        expect((await pool.query('SELECT id FROM companies WHERE id=$1',[manifest.companyId])).rowCount).toBe(0);
        cleanupVerified=true;
      } finally {await pool.end();}
      mkdirSync('.tmp',{recursive:true});
      writeFileSync('.tmp/uc22-56.json',JSON.stringify({node:process.version,client:'box',recordedAt:new Date().toISOString(),cleanupVerified,evidence},null,2)+'\n');
    }
    expect(evidence).toHaveLength(12);
    for(const row of evidence) expect(row.query.p95Ms).toBeLessThan(2000);
  });
});
