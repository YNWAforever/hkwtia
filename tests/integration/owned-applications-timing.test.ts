// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {describe, expect, it} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {fixtureManifest, seedHkwtiaFixtures, cleanupHkwtiaFixtures} from '@/scripts/acceptance/hkwtia-fixtures';
import {insertOwnedApplications, ownedFixtureTime} from '@/scripts/acceptance/owned-applications-fixture';
import {timingSummary, connectTimingPool, retryStats, isTransientConnectError} from '@/scripts/acceptance/db-timing';
import {createOwnedApplicationsRepository} from '@/lib/db/repos/owned-applications';

const target=process.env.HKWTIA_DB_ACCEPTANCE==='1' && process.env.HKWTIA_DB_TIMING==='1' ? localAcceptanceTarget() : null;

describe.skipIf(!target)('UC22-56 isolated DB timing (no Auth/HTTP)',()=>{
  it('measures production readers and verifies exact fixture cleanup',{timeout:600000},async()=>{
    neonConfig.webSocketConstructor=WebSocket;
    const manifest=fixtureManifest(`uc22-56-${randomUUID()}`);
    const actor={kind:'member' as const,userId:'synthetic-unbound',profileId:manifest.profiles[0].id};
    const ids=Array.from({length:10000},()=>randomUUID());
    let idlePoolErrors=0;
    const makePool=()=>{
      const pool=new Pool({connectionString:target!.databaseUrl,connectionTimeoutMillis:15000,max:1});
      pool.on('error',()=>{idlePoolErrors++;});
      return pool;
    };
    const infrastructure=retryStats();
    let pool:Pool|undefined;
    mkdirSync('.tmp',{recursive:true});
    const outputPath=`.tmp/${manifest.runId}.json`;
    const recovery={manifest,applicationIds:ids,ownerId:actor.profileId};
    const persist=()=>writeFileSync(outputPath,JSON.stringify({node:process.version,client:'box',recordedAt:new Date().toISOString(),cleanupVerified,idlePoolErrors,infrastructure,recovery,evidence},null,2)+'\n');
    const evidence:{failedSamples:number;query:ReturnType<typeof timingSummary>|null;[key:string]:unknown}[]=[];
    let cleanupVerified=false;
    try {
      persist();
      pool=(await connectTimingPool(makePool,infrastructure)).pool;
      await seedHkwtiaFixtures(target!,manifest.runId,infrastructure);
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
            const handshakes=retryStats();
            const samples:{index:number;attempts:number;failed:boolean}[]=[];
            for(let i=0;i<30;i++) {
              let connection=pool;
              let start=performance.now(),connected=start;
              const previousAttempts=handshakes.attempts;
              if(condition==='cold') {
                try {
                  const acquired=await connectTimingPool(makePool,handshakes);
                  connection=acquired.pool;start=acquired.start;connected=acquired.connected;
                } catch(error) {
                  if(!isTransientConnectError(error)) throw error;
                  samples.push({index:i,attempts:handshakes.attempts-previousAttempts,failed:true});
                  continue;
                }
              }
              try {
                const result=await invoke(condition==='cold'?reader(connection):repo);
                const finished=performance.now();
                check(result);
                queryMs.push(finished-connected);connectMs.push(connected-start);totalMs.push(finished-start);
                bytes.push(Buffer.byteLength(JSON.stringify(result)));
                samples.push({index:i,attempts:condition==='cold'?handshakes.attempts-previousAttempts:0,failed:false});
              } finally {if(condition==='cold') await connection.end();}
            }
            evidence.push({scale,ownedRows:scale+1,name,condition,handshakes,samples,failedSamples:handshakes.exhausted,query:queryMs.length?timingSummary(queryMs):null,connect:connectMs.length?timingSummary(connectMs):null,total:totalMs.length?timingSummary(totalMs):null,bytes:{min:bytes.length?Math.min(...bytes):null,max:bytes.length?Math.max(...bytes):null},queryMs,connectMs,totalMs,plan});
            persist();
          }
          queries.length=0;
        }
      }
    } finally {
      try {
        const cleanupPool=(await connectTimingPool(makePool,infrastructure)).pool;
        try {
          await cleanupPool.query('DELETE FROM membership_applications WHERE id=ANY($1::uuid[]) AND applicant_user_id=$2',[ids,actor.profileId]);
        } finally {await cleanupPool.end();}
        await cleanupHkwtiaFixtures(target!,manifest,infrastructure);
        const verificationPool=(await connectTimingPool(makePool,infrastructure)).pool;
        try {
          expect((await verificationPool.query('SELECT id FROM membership_applications WHERE id=ANY($1::uuid[])',[[...ids,...manifest.profiles.flatMap(p=>p.applicationId?[p.applicationId]:[])]])).rowCount).toBe(0);
          expect((await verificationPool.query('SELECT id FROM profiles WHERE id=ANY($1::text[])',[manifest.profiles.map(p=>p.id)])).rowCount).toBe(0);
          expect((await verificationPool.query('SELECT id FROM companies WHERE id=$1',[manifest.companyId])).rowCount).toBe(0);
          cleanupVerified=true;
        } finally {await verificationPool.end();}
      } finally {
        try {if(pool) await pool.end();} finally {persist();}
      }
    }
    expect(evidence).toHaveLength(12);
    for(const row of evidence) {
      expect(row.failedSamples,'At most 2 exhausted handshakes per 30 samples').toBeLessThanOrEqual(2);
      expect(row.query).not.toBeNull();
      expect(row.query!.p95Ms).toBeLessThan(2000);
    }
  });
});
