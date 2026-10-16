import {describe,expect,it,vi} from 'vitest';
import {compMembership} from '@/lib/db/repos/admin-membership';
import {ANONYMOUS_ACTOR} from '@/lib/membership/lifecycle';
describe('legacy comp is read-only',()=>{
 it.each([ANONYMOUS_ACTOR,{kind:'member',userId:'m',profileId:'m'},{kind:'system',userId:null,source:'stripe-webhook'}] as const)('refuses unauthorized actor %j',async actor=>{
  const transaction=vi.fn();await expect(compMembership(actor as never,{profileId:'synthetic',planCode:'community'},{transaction})).rejects.toThrow('FORBIDDEN');expect(transaction).not.toHaveBeenCalled();
 });
 it.each(['staff','exco','superadmin'] as const)('retires every old admin write for %s without DB work',async kind=>{
  const transaction=vi.fn();await expect(compMembership({kind,userId:'s',profileId:'s'},{profileId:'synthetic',planCode:'community'},{transaction})).rejects.toThrow('LEGACY_COMP_RETIRED');expect(transaction).not.toHaveBeenCalled();
 });
});
