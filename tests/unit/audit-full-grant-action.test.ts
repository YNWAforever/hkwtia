import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '@/lib/membership/lifecycle';
const session=vi.hoisted(()=>({kind:'superadmin' as 'superadmin'|'staff'|'exco'|'member',grant:vi.fn()}));
vi.mock('@/lib/auth/actor',async()=>{const {requireAdmin}=await import('@/lib/auth/authorize');const authorize:(actor:Actor)=>void=requireAdmin;return {requireAdminActor:async()=>{const actor={kind:session.kind,userId:'server-subject',profileId:'server-profile'};authorize(actor);return actor;}};});
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NEXT_NOT_FOUND');},redirect:()=>{throw Error('NEXT_REDIRECT');}}));
vi.mock('next-intl/server',()=>({getTranslations:async()=>()=> 'Use the approved finite grant workflow.'}));
vi.mock('@/lib/db/repos/membership-grants',()=>({grantMembership:session.grant}));
vi.mock('@/lib/admin/revalidate-path',()=>({revalidateAdminPath:()=>undefined}));
import {compMembershipAction} from '@/lib/admin/membership-comp-actions';
import {grantMembershipAction} from '@/lib/admin/membership-grant-actions';
const oldMessages={successMessage:'done',validationMessage:'invalid',errorMessage:'error',duplicateMessage:'duplicate'};
const messages={success:'done',invalid:'invalid',error:'error',duplicate:'duplicate'};
beforeEach(()=>{session.kind='superadmin';session.grant.mockReset();});
describe('manual grant HTTP wrappers use the server actor',()=>{
 it.each(['staff','exco','superadmin']as const)('returns retirement for %s and ignores forged actors in stale comp requests',async kind=>{
  session.kind=kind;const form=new FormData();form.set('actor','superadmin');form.set('profileId','another-profile');
  expect(await compMembershipAction('/admin',oldMessages,{},form)).toEqual({status:'error',code:'LEGACY_COMP_RETIRED',message:'Use the approved finite grant workflow.'});expect(session.grant).not.toHaveBeenCalled();
 });
 it('rejects a revoked member even when the stale body is malformed',async()=>{
  session.kind='member';await expect(compMembershipAction('/admin',oldMessages,{},new FormData())).rejects.toThrow('NEXT_NOT_FOUND');expect(session.grant).not.toHaveBeenCalled();
 });
 it.each(['member','staff','exco']as const)('rejects finite grant from %s despite a forged form actor',async kind=>{
  session.kind=kind;const form=new FormData();form.set('actor','superadmin');await expect(grantMembershipAction('bound-profile','/admin',messages,{},form)).rejects.toThrow('NEXT_NOT_FOUND');expect(session.grant).not.toHaveBeenCalled();
 });
 it('requires a request key and never reads a client target or actor',async()=>{
  const form=new FormData();for(const[key,value]of Object.entries({profileId:'forged-profile',actor:'staff',planCode:'community',effectiveAt:'2040-10-01T00:00',expiresAt:'2041-10-01T00:00',reason:'Approved synthetic decision'}))form.set(key,value);
  expect(await grantMembershipAction('bound-profile','/admin',messages,{},form)).toEqual({status:'error',message:'invalid'});expect(session.grant).not.toHaveBeenCalled();
  form.set('idempotencyKey','11111111-1111-4111-8111-111111111111');expect(await grantMembershipAction('bound-profile','/admin',messages,{},form)).toEqual({status:'success',message:'done'});
  expect(session.grant).toHaveBeenCalledWith({kind:'superadmin',userId:'server-subject',profileId:'server-profile'},expect.objectContaining({target:{kind:'profile',profileId:'bound-profile'}}),{requestKey:'11111111-1111-4111-8111-111111111111'});
 });
});
