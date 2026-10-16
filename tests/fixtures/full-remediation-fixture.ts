import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {z} from 'zod';
import {assertIsolatedSeedEnvironment, assertSeedSentinel} from '@/scripts/lib/acceptance-guard';
import {seedM2} from '@/scripts/seed-m2';

export const FULL_REMEDIATION_CLOCK = new Date('2026-10-01T04:00:00.000Z');
const confirmedProject = 'solitary-wave-52860119';
const confirmedHost = 'ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech';
function uuid(runId: string, scope: string): string {
  const hex = createHash('sha256').update(`${runId}:${scope}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function fullRemediationScopes(runId: string) {
  z.string().uuid().parse(runId);
  const profileIds = Array.from({length:5000}, (_,index) => `fr-${runId}-${String(index+1).padStart(5,'0')}`);
  return {profileIds, batch50:profileIds.slice(0,50), batch500:profileIds.slice(0,500), batch5000:profileIds,
    sector101:`FR101-${runId}`,sector51:`FR51-${runId}`,company101:uuid(runId,'company101'),company51:uuid(runId,'company51')};
}

/** Reuse M2 roles/history, adding only run-scoped scale data. Never provisions real Auth identities. */
export async function seedFullRemediationFixtures(options: {confirmedIsolated: true; runId: string}): Promise<{runId: string; counts: Record<string, number>}> {
  if(options.confirmedIsolated!==true) throw new Error('FULL_REMEDIATION_ISOLATION_NOT_CONFIRMED');
  const scopes=fullRemediationScopes(options.runId);
  const connectionString=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  if(process.env.NEON_PROJECT_ID!==confirmedProject || new URL(connectionString).hostname!==confirmedHost) throw new Error('FULL_REMEDIATION_CONFIRMED_TARGET_REQUIRED');
  if(process.env.AUDIT_BATCH_WORKER_PAUSED!=='true') throw new Error('FULL_REMEDIATION_PAUSED_WORKER_REQUIRED');
  const pool=new Pool({connectionString});
  try {
    await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
    const active=await pool.query("SELECT count(*)::int AS count FROM admin_batches WHERE state IN ('preparing','queued','running')");
    if(active.rows[0].count!==0) throw new Error('FULL_REMEDIATION_ACTIVE_BATCH_FORBIDDEN');
    await seedM2(pool);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // A fixed clock and stable IDs make a second run update the same rows.
      await client.query(`INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,consent_marketing,directory_visible,onboarding_state,created_at,updated_at)
        SELECT 'fr-'||$1||'-'||lpad(i::text,5,'0'), 'fr-auth-'||$1||'-'||i, 'fr-'||$1||'-'||i||'@remediation.example.test',
          'Full '||$1||' '||lpad(i::text,5,'0'),'member',CASE WHEN i%2=0 THEN 'zh-HK' ELSE 'en' END,false,false,'complete',$2,$2
        FROM generate_series(1,5000) AS i
        ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,locale=EXCLUDED.locale,consent_marketing=false,directory_visible=false,updated_at=EXCLUDED.updated_at`,[options.runId,FULL_REMEDIATION_CLOCK]);
      const statuses=['active','past_due','cancel_at_period_end','cancelled','expired','pending_review','pending_payment'];
      const rows=scopes.profileIds.slice(0,-1).map((id,index)=>({id:uuid(options.runId,`membership:${index}`),owner:id,status:index<101?'active':statuses[index%statuses.length],end:new Date(FULL_REMEDIATION_CLOCK.getTime()+[0,14,30,60,90,-1,120][index%7]*86_400_000).toISOString()}));
      await client.query(`INSERT INTO memberships(id,owner_user_id,plan_code,status,billing_interval,seat_limit,billing_period_start,billing_period_end,created_at,updated_at)
        SELECT id,owner,'community',status::membership_status,'none',1,$2,"end"::timestamptz,$2,$2
        FROM jsonb_to_recordset($1::jsonb) AS data(id uuid,owner text,status text,"end" text)
        ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,billing_period_start=EXCLUDED.billing_period_start,billing_period_end=EXCLUDED.billing_period_end,updated_at=EXCLUDED.updated_at`,[JSON.stringify(rows),FULL_REMEDIATION_CLOCK]);
      for(const [companyId,sector,count] of [[scopes.company101,scopes.sector101,101],[scopes.company51,scopes.sector51,51]] as const){
        await client.query(`INSERT INTO companies(id,legal_name,display_name,industry,directory_visible,created_at,updated_at)
          VALUES($1,$2,$2,$3,false,$4,$4) ON CONFLICT(id) DO UPDATE SET industry=EXCLUDED.industry,updated_at=EXCLUDED.updated_at`,[companyId,`Synthetic ${count} ${options.runId}`,sector,FULL_REMEDIATION_CLOCK]);
        const seats=scopes.profileIds.slice(0,count).map((id,index)=>({id:uuid(options.runId,`seat:${count}:${index}`),user_id:id,role:index===0?'owner':index===1?'admin':'member'}));
        await client.query(`INSERT INTO company_members(id,company_id,user_id,role,joined_at,revoked_at)
          SELECT id,$2,user_id,role::company_member_role,$3,NULL FROM jsonb_to_recordset($1::jsonb) AS data(id uuid,user_id text,role text)
          ON CONFLICT(id) DO UPDATE SET revoked_at=NULL`,[JSON.stringify(seats),companyId,FULL_REMEDIATION_CLOCK]);
      }
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
    const profiles=await pool.query('SELECT count(*)::int AS count FROM profiles WHERE id LIKE $1',[`fr-${options.runId}-%`]);
    const seats=await pool.query('SELECT company_id,count(*)::int AS count FROM company_members WHERE company_id IN ($1,$2) GROUP BY company_id',[scopes.company101,scopes.company51]);
    const counts={scaleProfiles:profiles.rows[0].count as number,segment101:seats.rows.find(row=>row.company_id===scopes.company101)?.count as number,segment51:seats.rows.find(row=>row.company_id===scopes.company51)?.count as number};
    return {runId:options.runId,counts};
  } finally {await pool.end();}
}
