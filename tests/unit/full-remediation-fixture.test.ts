// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import {seedFullRemediationFixtures} from '@/tests/fixtures/full-remediation-fixture';
const host='ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech';
const runId='00000000-0000-4000-8000-000000001001';
afterEach(()=>vi.unstubAllEnvs());
function validEnvironment(){
  vi.stubEnv('NODE_ENV','test');vi.stubEnv('VERCEL_ENV','preview');
  vi.stubEnv('DATABASE_URL','postgres://'+host+'/neondb');vi.stubEnv('DATABASE_URL_TEST','postgres://'+host+'/neondb');
  vi.stubEnv('FULL_REMEDIATION_ACCEPTANCE_SEED','true');vi.stubEnv('FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST',host);
  vi.stubEnv('NEON_PROJECT_ID','solitary-wave-52860119');
  vi.stubEnv('AUDIT_BATCH_WORKER_PAUSED','true');
}
describe('full remediation fixture mutation boundary',()=>{
  it('rejects unconfirmed isolation before opening a database',async()=>{
    validEnvironment();
    await expect(seedFullRemediationFixtures({confirmedIsolated:false as unknown as true,runId})).rejects.toThrow('ISOLATION_NOT_CONFIRMED');
  });
  it.each(['NODE_ENV','VERCEL_ENV'])('rejects production in %s before opening a database',async(name)=>{
    validEnvironment();vi.stubEnv(name,'production');
    await expect(seedFullRemediationFixtures({confirmedIsolated:true,runId})).rejects.toThrow('PRODUCTION_FORBIDDEN');
  });
  it('rejects a production host even if an operator supplies it in the mutable allowlist',async()=>{
    validEnvironment();const production='postgres://ep-steep-wind-production.neon.tech/neondb';
    vi.stubEnv('DATABASE_URL',production);vi.stubEnv('DATABASE_URL_TEST',production);
    vi.stubEnv('FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST','ep-steep-wind-production.neon.tech');
    await expect(seedFullRemediationFixtures({confirmedIsolated:true,runId})).rejects.toThrow('CONFIRMED_TARGET_REQUIRED');
  });
  it('requires an explicitly paused isolated batch worker',async()=>{
    validEnvironment();vi.stubEnv('AUDIT_BATCH_WORKER_PAUSED','false');
    await expect(seedFullRemediationFixtures({confirmedIsolated:true,runId})).rejects.toThrow('PAUSED_WORKER_REQUIRED');
  });
  it('rejects an invalid run identity before a write',async()=>{
    validEnvironment();await expect(seedFullRemediationFixtures({confirmedIsolated:true,runId:'not-a-run'})).rejects.toThrow();
  });
});
