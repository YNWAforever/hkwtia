// @vitest-environment node
import {Pool} from 'pg';
import {describe,expect,it} from 'vitest';
import {seedFullRemediationFixtures} from '@/tests/fixtures/full-remediation-fixture';
const runId='00000000-0000-4000-8000-000000001001';
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED!=='true')('real isolated remediation fixture',()=>{
  it('provides the 5000 scope and 101/51 segment data and is idempotent by run',async()=>{
    const first=await seedFullRemediationFixtures({confirmedIsolated:true,runId});
    expect(first.counts.scaleProfiles).toBe(5000);
    const second=await seedFullRemediationFixtures({confirmedIsolated:true,runId});
    expect(second).toEqual(first);
    const pool=new Pool({connectionString:process.env.DATABASE_URL_TEST});
    try{
      const rows=await pool.query("SELECT count(*)::int AS count, count(*) FILTER (WHERE email NOT LIKE '%@remediation.example.test')::int AS non_synthetic FROM profiles WHERE id LIKE $1",[`fr-${runId}-%`]);
      expect(rows.rows[0]).toEqual({count:5000,non_synthetic:0});
      expect(first.counts.segment101).toBe(101);expect(first.counts.segment51).toBe(51);
      const roles=await pool.query("SELECT count(DISTINCT role)::int AS count FROM profiles WHERE id LIKE 'm2-%'");
      expect(roles.rows[0].count).toBe(4);
    }finally{await pool.end();}
  },120_000);
});
