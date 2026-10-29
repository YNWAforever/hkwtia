// @vitest-environment node
import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {seedHkwtiaFixtures, cleanupHkwtiaFixtures, fixtureManifest} from '@/scripts/acceptance/hkwtia-fixtures';
import {createOwnedApplicationsRepository} from '@/lib/db/repos/owned-applications';
import {requireAdmin} from '@/lib/auth/authorize';

const enabled = process.env.HKWTIA_DB_ACCEPTANCE === '1';
// No URL means no connection; an explicit run with invalid identity must FAIL.
const target = enabled ? localAcceptanceTarget() : null;
const runId = 'r2-20261026-db';
const manifest = fixtureManifest(runId);
let pool: Pool;
const actor = (label: string) => {
  const p = manifest.profiles.find(p=>p.label===label)!;
  return {kind:'member' as const, userId:`synthetic-unbound:${p.id}`,profileId:p.id};
};
describe.skipIf(!target)('HKWTIA verified DB acceptance (no real Auth claims)', {timeout:120000}, ()=>{
  beforeAll(async()=>{
    await seedHkwtiaFixtures(target!,runId);
    neonConfig.webSocketConstructor = WebSocket;
    pool = new Pool({connectionString:target!.databaseUrl,connectionTimeoutMillis:15000});
  },120000);
  afterAll(async()=>{if(pool) await pool.end();});
  it('replays without duplicates: nine profiles, seven statuses, 3 draft + 2 review + 1 payment',async()=>{
    await seedHkwtiaFixtures(target!,runId);
    const profiles = await pool.query('SELECT id FROM profiles WHERE id=ANY($1::text[])',[manifest.profiles.map(p=>p.id)]);
    expect(profiles.rowCount).toBe(9);
    const applications = await pool.query('SELECT status,count(*)::int AS n FROM membership_applications WHERE id=ANY($1::uuid[]) GROUP BY status',[manifest.profiles.flatMap(p=>p.applicationId?[p.applicationId]:[])]);
    expect(Object.fromEntries(applications.rows.map(r=>[r.status,r.n]))).toEqual({draft:3,pending_review:2,pending_payment:1});
    const memberships=await pool.query('SELECT DISTINCT status FROM memberships WHERE id=ANY($1::uuid[])',[manifest.profiles.flatMap(p=>p.membershipId?[p.membershipId]:[])]);
    expect(memberships.rowCount).toBe(7);
    expect((await pool.query('SELECT id FROM memberships WHERE id=ANY($1::uuid[])',[manifest.profiles.flatMap(p=>p.membershipId?[p.membershipId]:[])])).rowCount).toBe(8);
    const free=manifest.profiles.find(p=>p.label==='FREE')!;
    expect((await pool.query('SELECT plan_code,status FROM memberships WHERE id=$1',[free.membershipId])).rows).toEqual([{plan_code:'community',status:'active'}]);
    const seats=await pool.query('SELECT user_id,revoked_at FROM company_members WHERE company_id=$1',[manifest.companyId]);
    expect(seats.rowCount).toBe(3);
    expect(seats.rows.find(p=>p.user_id===manifest.profiles.find(p=>p.label==='REVOKED')!.id)?.revoked_at).not.toBeNull();
  });
  it('A reads own application; B cannot read A; NONSTAFF refuses before write/provider factory',async()=>{
    const repository = createOwnedApplicationsRepository(async()=>drizzle(pool));
    const snapshot = async()=> (await pool.query(`SELECT (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM profiles t) AS profiles, (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM contacts t) AS contacts, (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM membership_applications t) AS applications, (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM audit_events t) AS audit`)).rows[0];
    const before = await snapshot();
    const a = manifest.profiles[0];
    expect((await repository.getOwnedById(actor('A'),a.applicationId!))?.id).toBe(a.applicationId);
    expect(await repository.getOwnedById(actor('B'),a.applicationId!)).toBeNull();
    const write = vi.fn(), provider=vi.fn();
    expect(()=>{requireAdmin(actor('NONSTAFF'));write();provider();}).toThrow();
    expect(write).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
  it('exact-ID cleanup reads back absence and can reseed the same run',async()=>{
    await cleanupHkwtiaFixtures(target!,manifest);
    expect((await pool.query('SELECT id FROM profiles WHERE id=ANY($1::text[])',[manifest.profiles.map(p=>p.id)])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM companies WHERE id=$1',[manifest.companyId])).rowCount).toBe(0);
    for (const table of ['membership_applications','memberships','company_members'] as const) {
      const ids=manifest.profiles.flatMap(p=>{const id=table==='membership_applications'?p.applicationId:table==='memberships'?p.membershipId:p.seatId;return id?[id]:[];});
      expect((await pool.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[])`,[ids])).rowCount).toBe(0);
    }
    await seedHkwtiaFixtures(target!,runId);
  });
});
