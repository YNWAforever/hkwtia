import {render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {getBatchCapabilities} from '@/lib/admin/batches/capabilities';
import {getBatchPreview,prepareBatch,type BatchGateway} from '@/lib/admin/batches/service';
import type {AdminActor} from '@/lib/membership/lifecycle';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('@/lib/admin/batches/actions',()=>({prepareAdminBatchAction:vi.fn()}));
import {MemberBulkTable} from '@/components/admin/member-bulk-table';
const flags=['ADMIN_BATCH_ENABLED','MEMBER_IMPORT_ENABLED','MEMBERSHIP_GRANTS_ENABLED','MEMBERSHIP_GRANT_BATCH_ENABLED','MEMBER_COMMUNICATION_BATCH_ENABLED','EVENT_ATTENDEE_EXPORT_ENABLED','MEMBER_EXPORT_ENABLED','TICKET_RESEND_BATCH_ENABLED'];
const staff={kind:'staff',userId:'synthetic-staff',profileId:'synthetic-staff'} as const;
const labels={name:'Name',email:'Email',company:'Company',plan:'Plan',status:'Status',renewal:'Renewal',score:'Score',view:'View',caption:'Members',empty:'No members',unavailable:'Unavailable',previous:'Previous',next:'Next'};
const selectionLabels={page:'Select this page',all:'Select all {count} matching',clear:'Clear selection',selected:'{count} selected',row:'Select {name}',explicitScope:'Checked members only',allMatchingScope:'All matching members except exclusions',unavailable:'Batch operations are not available in this environment.'};
const item={profileId:'synthetic',membershipId:'synthetic',companyId:null,displayName:'Synthetic Member',email:null,companyName:null,planCode:'community',membershipStatus:'active',renewalAt:null,score:null,matchingMembershipIds:['synthetic']};
afterEach(()=>vi.unstubAllEnvs());
function disableFlags(){for(const name of flags)vi.stubEnv(name,'false');}
describe('batch capabilities match current server authority',()=>{
 it('offers no checkboxes or selection toolbar when no operations are available',()=>{
  render(<MemberBulkTable locale='en' items={[item]} totalMatching={101} labels={labels} selectionLabels={selectionLabels} selectionKey='disabled' rowHrefs={{synthetic:'/admin/members/synthetic'}} previousHref={null} nextHref='/admin/members?cursor=next'/>);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.queryByRole('button',{name:/Select all/})).not.toBeInTheDocument();
  expect(screen.getByText(selectionLabels.unavailable)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Synthetic Member'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Next'})).toBeInTheDocument();
 });
 it('disables every registered operation with the global flag off',async()=>{
  disableFlags();const capabilities=await getBatchCapabilities(staff);
  expect(capabilities).toHaveLength(8);expect(capabilities.every(item=>!item.available&&item.reasonCode)).toBe(true);
 });
 it('exposes only the available operations under partial rollout',async()=>{
  disableFlags();vi.stubEnv('ADMIN_BATCH_ENABLED','true');
  const capabilities=await getBatchCapabilities(staff);
  expect(capabilities.filter(item=>item.available).map(item=>item.operation)).toEqual(['profile_patch']);
  expect(capabilities.find(item=>item.operation==='export_members')?.reasonCode).toBe('BATCH_OPERATION_UNAVAILABLE');
 });
 it.each(['staff','exco','superadmin'] as const)('preserves the special grant role boundary for %s',async(kind)=>{
  for(const name of flags)vi.stubEnv(name,'true');
  const capabilities=await getBatchCapabilities({...staff,kind});
  expect(capabilities.find(item=>item.operation==='membership_grant')).toEqual({operation:'membership_grant',available:kind==='superadmin',reasonCode:kind==='superadmin'?null:'FORBIDDEN'});
 });
 it('rejects a forged member actor rather than treating client role hints as authority',async()=>{
  await expect(getBatchCapabilities({...staff,kind:'member'} as unknown as AdminActor)).rejects.toThrow('FORBIDDEN');
 });
 it('keeps history readable while a stale UI cannot prepare a new operation',async()=>{
  disableFlags();const batchId='11111111-1111-4111-8111-111111111111';
  const create=vi.fn();const preview=vi.fn(async()=>({batchId,state:'ready'}));
  const store={create,preview} as unknown as BatchGateway;
  expect((await getBatchPreview(staff,batchId,store)).state).toBe('ready');
  await expect(prepareBatch(staff,{operation:'profile_patch',idempotencyKey:batchId,selection:{mode:'ids',profileIds:['synthetic']},payload:{patch:{locale:'en'},reason:'Synthetic approved correction'}},store)).rejects.toThrow('BATCH_OPERATION_UNAVAILABLE');
  expect(create).not.toHaveBeenCalled();expect(preview).toHaveBeenCalledOnce();
 });
});
