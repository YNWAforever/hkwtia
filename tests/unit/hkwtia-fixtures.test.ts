import {describe,expect,it} from 'vitest';
import {fixtureManifest,seedHkwtiaFixtures,cleanupHkwtiaFixtures} from '@/scripts/acceptance/hkwtia-fixtures';
import type {VerifiedTarget} from '@/scripts/acceptance/target';

describe('run-scoped acceptance fixtures',()=>{
  it('uses stable exact IDs and all nine role labels',()=>{
    const m=fixtureManifest('r2-unit');
    expect(m).toEqual(fixtureManifest('r2-unit'));
    expect(m.profiles.map(p=>p.label)).toEqual(['A','B','C','SEAT','REVOKED','D','E','NONSTAFF','FREE']);
    expect(new Set(m.profiles.flatMap(p=>p.membershipStatus?[p.membershipStatus]:[])).size).toBe(7);
    expect(m.profiles.filter(p=>p.applicationStatus==='draft')).toHaveLength(3);
    expect(m.profiles.filter(p=>p.applicationStatus==='pending_review')).toHaveLength(2);
    expect(m.profiles.filter(p=>p.applicationStatus==='pending_payment')).toHaveLength(1);
    expect(fixtureManifest('other').companyId).not.toBe(m.companyId);
  });
  it('refuses fabricated verified handles before attempting DB access',async()=>{
    const fake={} as VerifiedTarget;
    await expect(seedHkwtiaFixtures(fake,'r2-unit')).rejects.toThrow('HKWTIA_ACCEPTANCE_VERIFIED_TARGET_REQUIRED');
    await expect(cleanupHkwtiaFixtures(fake,fixtureManifest('r2-unit'))).rejects.toThrow('HKWTIA_ACCEPTANCE_VERIFIED_TARGET_REQUIRED');
  });
});
