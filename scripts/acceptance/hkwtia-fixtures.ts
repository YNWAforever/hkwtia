import {createHash} from 'node:crypto';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {assertVerifiedTarget, type VerifiedTarget} from './target';
import {connectTimingPool, type RetryStats} from './db-timing';
import {seedM1Plans} from '../seed-m1';

export const LABELS = ['A','B','C','SEAT','REVOKED','D','E','NONSTAFF','FREE'] as const;
const statuses = ['active','past_due','cancel_at_period_end','cancelled','expired','pending_review','pending_payment'] as const;
function uuid(runId: string, label: string): string {
  const h = createHash('sha256').update(`hkwtia:${runId}:${label}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function fixtureManifest(runId: string) {
  if (!/^[a-z0-9-]{1,48}$/.test(runId)) throw Error('HKWTIA_ACCEPTANCE_RUN_ID_INVALID');
  return {runId, companyId: uuid(runId,'company'), profiles: LABELS.map((label, index) => ({label,
    id: `hkwtia-${runId}-${label.toLowerCase()}`, role: label === 'D' ? 'staff' : label === 'E' ? 'exco' : 'member',
    membershipId: index < 7 || label === 'FREE' ? uuid(runId,`membership-${label}`) : null,
    membershipStatus: index < 7 ? statuses[index] : label === 'FREE' ? 'active' : null,
    applicationId: index < 6 ? uuid(runId,`application-${label}`) : null,
    applicationStatus: index < 3 ? 'draft' : index < 5 ? 'pending_review' : index === 5 ? 'pending_payment' : null,
    seatId: ['A','SEAT','REVOKED'].includes(label) ? uuid(runId,`seat-${label}`) : null,
  }))};
}
export type FixtureManifest = ReturnType<typeof fixtureManifest>;
export async function seedHkwtiaFixtures(target: VerifiedTarget, runId: string, stats?:RetryStats): Promise<FixtureManifest> {
  assertVerifiedTarget(target);
  const manifest = fixtureManifest(runId);
  neonConfig.webSocketConstructor = WebSocket;
  const {pool} = await connectTimingPool(()=>{
    const pool=new Pool({connectionString: target.databaseUrl,connectionTimeoutMillis:15000});
    pool.on('error',()=>{/* Idle transport drops are handled by the next operation. */});
    return pool;
  },stats);
  const client = await pool.connect().catch(async (error: unknown) => {await pool.end(); throw error;});
  try {
    await client.query('BEGIN');
    await seedM1Plans(client);
    await client.query(`INSERT INTO companies(id,legal_name,display_name,directory_visible) VALUES($1,'Synthetic acceptance company','Synthetic acceptance company',false) ON CONFLICT(id) DO NOTHING`, [manifest.companyId]);
    for (const p of manifest.profiles) {
      await client.query(`INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,consent_marketing,whatsapp_opt_in,directory_visible)
        VALUES($1,$2,$3,$4,$5,'en',false,false,false) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,consent_marketing=false,whatsapp_opt_in=false,directory_visible=false`,
        [p.id, `synthetic-unbound:${p.id}`, `${p.id}@acceptance.example.test`, `Synthetic ${p.label}`,p.role]);
      if (p.applicationId) await client.query(`INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'community',$3) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`,[p.applicationId,p.id,p.applicationStatus]);
      if (p.membershipId) await client.query(`INSERT INTO memberships(id,owner_user_id,company_id,plan_code,status,billing_interval,seat_limit) VALUES($1,$2,$3,$4,$5,'none',$6) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,owner_user_id=EXCLUDED.owner_user_id,company_id=EXCLUDED.company_id,plan_code=EXCLUDED.plan_code,seat_limit=EXCLUDED.seat_limit`,[p.membershipId,p.label === 'A' ? null : p.id,p.label === 'A' ? manifest.companyId : null,p.label === 'A' ? 'corporate' : 'community',p.membershipStatus,p.label === 'A' ? 25 : 1]);
      if (p.seatId) await client.query(`INSERT INTO company_members(id,company_id,user_id,role,revoked_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at`,[p.seatId,manifest.companyId,p.id,p.label === 'A' ? 'owner' : 'member',p.label === 'REVOKED' ? '2026-10-26T00:00:00Z' : null]);
    }
    await client.query('COMMIT');
    return manifest;
  } catch (error) {await client.query('ROLLBACK'); throw error;}
  finally {client.release(); await pool.end();}
}
export async function cleanupHkwtiaFixtures(target: VerifiedTarget, manifest: FixtureManifest, stats?:RetryStats): Promise<void> {
  assertVerifiedTarget(target);
  if (JSON.stringify(manifest) !== JSON.stringify(fixtureManifest(manifest.runId))) throw Error('HKWTIA_ACCEPTANCE_MANIFEST_INVALID');
  neonConfig.webSocketConstructor = WebSocket;
  const {pool} = await connectTimingPool(()=>{
    const pool=new Pool({connectionString: target.databaseUrl,connectionTimeoutMillis:15000});
    pool.on('error',()=>{/* Idle transport drops are handled by the next operation. */});
    return pool;
  },stats);
  const client = await pool.connect().catch(async (error: unknown) => {await pool.end(); throw error;});
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM profiles WHERE id = ANY($1::text[])',[manifest.profiles.map(p=>p.id)]);
    await client.query('DELETE FROM companies WHERE id=$1',[manifest.companyId]);
    const rows = await client.query('SELECT id FROM profiles WHERE id = ANY($1::text[])',[manifest.profiles.map(p=>p.id)]);
    if (rows.rowCount !== 0) throw Error('HKWTIA_ACCEPTANCE_CLEANUP_FAILED');
    await client.query('COMMIT');
  } catch (error) {await client.query('ROLLBACK'); throw error;}
  finally {client.release(); await pool.end();}
}
