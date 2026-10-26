// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {seedHkwtiaFixtures, cleanupHkwtiaFixtures, fixtureManifest} from '@/scripts/acceptance/hkwtia-fixtures';
import {createSupplementService, type SupplementResult, type SupplementRepository} from '@/lib/membership/supplement-service';
import {createSupplementBinding} from '@/lib/membership/supplement-binding';
import {createSupplementRepository} from '@/lib/db/repos/application-supplements';

const target = process.env.HKWTIA_DB_ACCEPTANCE === '1' ? localAcceptanceTarget() : null;
const manifest = fixtureManifest('t22-04a-persistence');
const a = {kind:'member' as const,userId:'synthetic-a',profileId:manifest.profiles[0].id};
const b = {...a,profileId:manifest.profiles[1].id};
const staff = {kind:'staff' as const,userId:'synthetic-d',profileId:manifest.profiles[5].id};
const applicationId = manifest.profiles[0].applicationId!;
const otherStaff={...staff,profileId:'hkwtia-t22-04a-second-staff'};
const items = [{itemId:'website',label:'Company website',required:true}];
const answers = [{itemId:'website',text:'Synthetic response'}];
const saved = (r: SupplementResult) => {expect(r.status).toBe('saved');if(r.status!=='saved') throw Error('EXPECTED_SAVED');return r.reference;};
let pool: Pool;
let repo: SupplementRepository;
let service: ReturnType<typeof createSupplementService>;
const draft = async () => saved(await service.createSupplementDraft(staff,{applicationId,items,dueAt:null,staffContext:'PRIVATE-STAFF-SENTINEL',operationRequestId:randomUUID()}));
describe.skipIf(!target)('supplement SQL persistence (synthetic actors; no Auth/browser claim)',{timeout:120000},()=>{
  beforeAll(async()=>{
    await seedHkwtiaFixtures(target! ,manifest.runId);
    neonConfig.webSocketConstructor = WebSocket;
    pool = new Pool({connectionString:target!.databaseUrl,connectionTimeoutMillis:15000});
    await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,consent_marketing,whatsapp_opt_in,directory_visible) VALUES($1,$2,$3,'Synthetic second staff','staff','en',false,false,false) ON CONFLICT(id) DO NOTHING",[otherStaff.profileId,'synthetic-unbound:'+otherStaff.profileId,otherStaff.profileId+'@acceptance.example.test']);
    repo = createSupplementRepository(async()=>drizzle(pool));
    service = createSupplementService(repo);
  },120000);
  afterAll(async()=>{
    if(pool) {
      await pool.query("DELETE FROM audit_events WHERE target_type='application_supplement' AND target_id IN (SELECT id::text FROM application_supplement_requests WHERE application_id=$1)",[applicationId]);
      await pool.query('DELETE FROM profiles WHERE id=$1',[otherStaff.profileId]);
      await cleanupHkwtiaFixtures(target!,manifest);
      await pool.end();
    }
  });
  it('applies the actual migration to existing application rows without manufacturing member supplements',async()=>{
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA t22_supplement_migration');
      await client.query('SET LOCAL search_path TO t22_supplement_migration, public');
      await client.query('CREATE TABLE t22_supplement_migration.profiles (LIKE public.profiles INCLUDING ALL)');
      await client.query('CREATE TABLE t22_supplement_migration.membership_applications (LIKE public.membership_applications INCLUDING ALL)');
      await client.query('INSERT INTO t22_supplement_migration.profiles SELECT * FROM public.profiles WHERE id=ANY($1::text[])',[manifest.profiles.map(p=>p.id)]);
      await client.query('INSERT INTO t22_supplement_migration.membership_applications SELECT * FROM public.membership_applications WHERE id=$1',[applicationId]);
      const before=(await client.query('SELECT * FROM t22_supplement_migration.membership_applications')).rows;
      expect(before).toHaveLength(1);
      const migration=readFileSync('drizzle/0066_application_supplements.sql','utf8').replaceAll('"public".','"t22_supplement_migration".');
      for(const statement of migration.split('--> statement-breakpoint')) if(statement.trim()) await client.query(statement);
      expect((await client.query('SELECT * FROM t22_supplement_migration.membership_applications')).rows).toEqual(before);
      for(const table of ['application_supplement_requests','application_supplement_responses','application_supplement_receipts']) {
        expect((await client.query('SELECT count(*)::int AS n FROM t22_supplement_migration.'+table)).rows).toEqual([{n:0}]);
      }
    } finally {await client.query('ROLLBACK');client.release();}
  });
  it('preserves existing application data; hides drafts, denies B and never projects staff context',async()=>{
    const before = (await pool.query('SELECT * FROM membership_applications WHERE id=$1',[applicationId])).rows;
    const r = await draft();
    expect(await service.listMySupplementRequests(a,{applicationId})).toEqual([]);
    await expect(service.listMySupplementRequests(b,{applicationId})).rejects.toThrow('FORBIDDEN');
    expect(await service.respondToSupplementRequest(b,{requestId:r.requestId,expectedVersion:1,answers,operationRequestId:randomUUID()})).toEqual({status:'forbidden'});
    saved(await service.publishSupplementRequest(staff,{requestId:r.requestId,expectedVersion:1,operationRequestId:randomUUID()}));
    const rows = await service.listMySupplementRequests(a,{applicationId});
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/staffContext|PRIVATE-STAFF-SENTINEL|createdBy/);
    expect((await pool.query('SELECT * FROM membership_applications WHERE id=$1',[applicationId])).rows).toEqual(before);
    saved(await service.cancelSupplementRequest(staff,{requestId:r.requestId,expectedVersion:2,reason:'Next test',operationRequestId:randomUUID()}));
  });
  it('replays keys, refuses changed payload and stale versions; recovers committed lost response receipts',async()=>{
    const operationRequestId = randomUUID();
    const input = {applicationId,items,dueAt:null,operationRequestId};
    const first = await service.createSupplementDraft(staff,input);
    expect(await service.createSupplementDraft(staff,input)).toEqual(first);
    expect(await service.createSupplementDraft(staff,{...input,staffContext:'changed'})).toMatchObject({status:'conflict',reason:'idempotency_key_reused'});
    const r = saved(first);
    saved(await service.publishSupplementRequest(staff,{requestId:r.requestId,expectedVersion:1,operationRequestId:randomUUID()}));
    expect(await service.respondToSupplementRequest(a,{requestId:r.requestId,expectedVersion:1,answers,operationRequestId:randomUUID()})).toMatchObject({status:'conflict',reason:'stale_version'});
    const lossy: SupplementRepository = {async transaction(work,scope) {await repo.transaction(work,scope);throw Error('LOST_AFTER_COMMIT');}};
    const submit = {requestId:r.requestId,expectedVersion:2,answers,operationRequestId:randomUUID()};
    expect(await createSupplementService(lossy).respondToSupplementRequest(a,submit)).toMatchObject({status:'unknown'});
    const receipt = await service.getOperationReceipt(a,{operationRequestId:submit.operationRequestId});
    expect(receipt).toMatchObject({status:'saved'});
    expect(await service.respondToSupplementRequest(a,submit)).toEqual(receipt);
    expect(await service.getOperationReceipt(b,{operationRequestId:submit.operationRequestId})).toBeNull();
    expect((await pool.query('SELECT id FROM application_supplement_responses WHERE request_id=$1',[r.requestId])).rowCount).toBe(1);
    expect((await pool.query("SELECT id FROM audit_events WHERE request_id=$1 AND target_type='application_supplement'",[submit.operationRequestId])).rowCount).toBe(1);
    const other = await draft();
    expect(await service.publishSupplementRequest(staff,{requestId:other.requestId,expectedVersion:1,operationRequestId:randomUUID()})).toMatchObject({status:'conflict',reason:'open_request_exists'});
    saved(await service.closeSupplementRequest(staff,{requestId:r.requestId,expectedVersion:3,operationRequestId:randomUUID()}));
  });
  it('binds form-shaped payloads to SQL with fresh synthetic actors and an explicit write gate',async()=>{
    const r=await draft();
    let current: typeof staff | typeof a | typeof b = staff;
    let enabled=false;
    const binding=createSupplementBinding({enabled:()=>enabled,actor:async()=>current,repository:repo});
    const input={requestId:r.requestId,expectedVersion:1,operationRequestId:randomUUID()};
    expect(await binding.publish(input)).toEqual({status:'forbidden'});
    enabled=true;
    saved(await binding.publish(input));
    current=b;
    const response={...input,expectedVersion:2,operationRequestId:randomUUID(),answers};
    expect(await binding.respond(response)).toEqual({status:'forbidden'});
    current=a;
    const result=await binding.respond(response);
    saved(result);
    enabled=false;
    expect(await binding.receipt(response.operationRequestId)).toEqual(result);
    expect((await pool.query('SELECT id FROM application_supplement_responses WHERE request_id=$1',[r.requestId])).rowCount).toBe(1);
    saved(await service.closeSupplementRequest(staff,{requestId:r.requestId,expectedVersion:3,operationRequestId:randomUUID()}));
  });
  it('serializes independent repository instances and independently enforces the DB open constraint',async()=>{
    const one=await draft(), two=await draft();
    const second=createSupplementService(createSupplementRepository(async()=>drizzle(pool)));
    const result=await Promise.all([service,second].map((s,i)=>s.publishSupplementRequest([staff,otherStaff][i],{requestId:[one,two][i].requestId,expectedVersion:1,operationRequestId:randomUUID()})));
    expect(result.map(r=>r.status).sort()).toEqual(['conflict','saved']);
    const loser=[one,two][result.findIndex(r=>r.status==='conflict')];
    await expect(pool.query("UPDATE application_supplement_requests SET status='responded',published_at=now() WHERE id=$1",[loser.requestId])).rejects.toMatchObject({code:'23505'});
  });
  it('rolls back request, receipt and audit together on a database failure',async()=>{
    const operationRequestId=randomUUID();
    // Force audit FK failure after request + receipt inserts, exercising real rollback.
    const brokenActor={...staff,profileId:'synthetic-missing-'+randomUUID()};
    const before=(await pool.query('SELECT count(*)::int AS n FROM application_supplement_requests WHERE application_id=$1',[applicationId])).rows;
    expect(await service.createSupplementDraft(brokenActor,{applicationId,items,dueAt:null,operationRequestId})).toMatchObject({status:'unknown'});
    expect(await service.getOperationReceipt(brokenActor,{operationRequestId})).toBeNull();
    expect((await pool.query('SELECT count(*)::int AS n FROM application_supplement_requests WHERE application_id=$1',[applicationId])).rows).toEqual(before);
    expect((await pool.query('SELECT id FROM audit_events WHERE request_id=$1',[operationRequestId])).rowCount).toBe(0);
  });
});
