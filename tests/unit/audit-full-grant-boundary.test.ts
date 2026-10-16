import {describe,expect,it,vi} from 'vitest';
import {compMembership} from '@/lib/db/repos/admin-membership';
import {grantMembership} from '@/lib/db/repos/membership-grants';
import {isMembershipGrantEffectiveAt} from '@/lib/membership/grants';
const input={target:{kind:'profile',profileId:'synthetic-member'},planCode:'community',effectiveAt:'2026-10-01T00:00:00.000Z',expiresAt:'2026-11-01T00:00:00.000Z',reason:'Approved synthetic scholarship'};
describe('all manual grant entry boundaries',()=>{
 for(const kind of ['staff','exco','superadmin'] as const)it('retired comp cannot grant through '+kind,async()=>{
  const transaction=vi.fn(async work=>work({hasLiveMembership:async()=>false,planSeatAllowance:async()=>1,insertMembership:async()=>({id:'11111111-1111-4111-8111-111111111111'}),insertAudit:async()=>undefined}));
  await expect(compMembership({kind,userId:'synthetic',profileId:'synthetic'}, {profileId:'synthetic-member',planCode:'community'},{transaction})).rejects.toThrow('LEGACY_COMP_RETIRED');
  expect(transaction).not.toHaveBeenCalled();
 });
 for(const kind of ['member','staff','exco'] as const)it('finite grant rejects '+kind+' even with an enabled capability',async()=>{
  const loadDatabase=vi.fn();
  await expect(grantMembership({kind,userId:'synthetic',profileId:'synthetic'},input,{enabled:true,loadDatabase})).rejects.toThrow('FORBIDDEN');
  expect(loadDatabase).not.toHaveBeenCalled();
 });
 it('keeps historical indefinite entitlement and the finite expiry boundary',()=>{
  expect(isMembershipGrantEffectiveAt({effectiveAt:null,expiresAt:null},new Date('2099-01-01'))).toBe(true);
  expect(isMembershipGrantEffectiveAt({effectiveAt:new Date(input.effectiveAt),expiresAt:new Date(input.expiresAt)},new Date(input.expiresAt))).toBe(false);
 });
});
