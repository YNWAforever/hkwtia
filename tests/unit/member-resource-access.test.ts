import {describe,it,expect,vi} from 'vitest';
import {createMemberResourceReader, type MemberResource} from '@/lib/portal/member-resources';
import type {Actor, MembershipRecord} from '@/lib/membership/lifecycle';
const owner = {kind:'member',profileId:'owner',userId:'owner'} as const;
const seat = {...owner,profileId:'seat',userId:'seat'};
const outsider = {...owner,profileId:'outsider',userId:'outsider'};
const membership: MembershipRecord = {id:'company',ownerUserId:'owner',companyId:'company',planCode:'corporate',status:'active',billingInterval:'annual',seatLimit:5};
const v1: MemberResource = {id:'synthetic-resource',version:1,state:'published',title:'Synthetic contract only',publishedAt:'2026-10-26T00:00:00Z',planCodes:['corporate']};
function setup(rows: MemberResource[]) {
 const versions=vi.fn(async()=>rows);
 return {versions,reader:createMemberResourceReader({versions,memberships:async(a:Actor)=>'profileId' in a && ['owner','seat'].includes(a.profileId)?[membership]:[]})};
}
describe('member resource contract (no owner content or byte delivery claim)',()=>{
 it.each([owner,seat])('allows entitled $profileId; never exposes permanent byte URLs',async actor=>{
  const {reader}=setup([v1]);
  expect(await reader.listApproved(actor)).toMatchObject([{kind:'resource',url:null}]);
  expect(await reader.authorizeDownload(actor,v1.id,1)).toEqual(v1);
 });
 it('rejects outsider before reading resources',async()=>{
  const {reader,versions}=setup([v1]);
  await expect(reader.authorizeDownload(outsider,v1.id,1)).rejects.toThrow('FORBIDDEN');
  expect(versions).not.toHaveBeenCalled();
 });
 it('hides drafts; draft v2 keeps v1, published v2 invalidates v1; withdrawal never revives v1',async()=>{
  const rows: MemberResource[]=[{...v1,state:'draft'}]; const {reader}=setup(rows);
  expect(await reader.listApproved(owner)).toEqual([]);
  rows[0]=v1; rows.push({...v1,version:2,state:'draft'});
  expect(await reader.authorizeDownload(owner,v1.id,1)).toEqual(v1);
  rows[1]={...v1,version:2};
  await expect(reader.authorizeDownload(owner,v1.id,1)).rejects.toThrow('FORBIDDEN');
  expect((await reader.authorizeDownload(owner,v1.id,2)).version).toBe(2);
  rows[1]={...rows[1],state:'withdrawn'};
  expect(await reader.listApproved(owner)).toEqual([]);
  await expect(reader.authorizeDownload(owner,v1.id,2)).rejects.toThrow('FORBIDDEN');
 });
 it('rechecks revoked membership on the next authorization and rejects anonymous actors',async()=>{
  let memberships: MembershipRecord[]=[membership];
  const reader=createMemberResourceReader({versions:async()=>[v1],memberships:async()=>memberships});
  expect(await reader.authorizeDownload(seat,v1.id,1)).toEqual(v1);
  memberships=[];
  await expect(reader.authorizeDownload(seat,v1.id,1)).rejects.toThrow('FORBIDDEN');
  await expect(reader.authorizeDownload({kind:'anonymous',userId:null},v1.id,1)).rejects.toThrow('FORBIDDEN');
 });
 it('does not revive an older version when current audience excludes actor; rereads current grants',async()=>{
  const rows=[v1,{...v1,version:2,planCodes:['startup'] as const}];
  expect(await setup(rows).reader.listApproved(owner)).toEqual([]);
 });
});
