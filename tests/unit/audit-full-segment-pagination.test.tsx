import {render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {SegmentResults} from '@/components/admin/segment-results';
import {previewSegment,type SegmentAudienceRow,type SegmentReader} from '@/lib/admin/segments';
import en from '@/messages/en.json';
const actor={kind:'staff',userId:'synthetic-staff',profileId:'synthetic-staff'} as const;
const member:SegmentAudienceRow={kind:'member',id:'synthetic-51',displayName:'Synthetic 51',email:null,companyName:null,planCode:'community',membershipStatus:'active',renewalAt:null,score:null,whatsappNumber:null,whatsappOptIn:false,contactStage:null,contactSource:null};
const pointer=Buffer.from(JSON.stringify({sortKey:'synthetic 50',kind:'member',id:'synthetic-50'})).toString('base64url');
describe('segment cursor navigation and range',()=>{
 it('renders previous/next links and the actual range without substituting the page length for the total',()=>{
  const props={labels:{...en.Admin.segments,previous:'Previous',next:'Next',range:'Showing {start}–{end} of {total}'},preview:{total:101,items:[member],nextCursor:pointer},saved:[],queueAction:async()=>({disposition:null,recipientCount:0,error:null} as const),newDraftHref:'/zh/admin/segments?campaignDraft=00000000-0000-4000-8000-000000000003',pagination:{previousHref:'/zh/admin/segments?sector=synthetic&campaignDraft=00000000-0000-4000-8000-000000000003',nextHref:'/zh/admin/segments?sector=synthetic&cursor=next&campaignDraft=00000000-0000-4000-8000-000000000003',offset:50}};
  render(<SegmentResults {...props}/>);
  expect(screen.getByRole('link',{name:'Previous'})).toHaveAttribute('href',props.pagination.previousHref);
  expect(screen.getByRole('link',{name:'Next'})).toHaveAttribute('href',props.pagination.nextHref);
  expect(screen.getByText('Showing 51–51 of 101')).toBeInTheDocument();
  expect(screen.getByText('Members: 101')).toBeInTheDocument();
 });
 it('binds a returned cursor to the validated filter and keeps a stable absolute offset',async()=>{
  const reader:SegmentReader={preview:async()=>({total:101,items:[member],nextCursor:pointer})};
  const result=await previewSegment(actor,{filter:{sector:'synthetic'},limit:50},reader);
  const bound=JSON.parse(Buffer.from(result.nextCursor!,'base64url').toString());
  expect(bound.scope).toMatch(/^[a-f0-9]{64}$/);expect(bound.cursor).toBe(pointer);expect(bound.offset).toBe(1);
 });
 it('does not apply an old cursor position after changing the filter',async()=>{
  const preview=vi.fn(async()=>({total:51,items:[member],nextCursor:null}));
  const stale=Buffer.from(JSON.stringify({scope:'0'.repeat(64),cursor:pointer,offset:50})).toString('base64url');
  await previewSegment(actor,{filter:{sector:'changed'},limit:50,cursor:stale},{preview});
  expect(preview).toHaveBeenCalledWith(actor,expect.objectContaining({sector:'changed'}),{limit:50,cursor:null},undefined);
 });
 it('preserves failed reads as failures, distinct from an empty successful page',async()=>{
  await expect(previewSegment(actor,{filter:{}},{preview:async()=>{throw Error('SYNTHETIC_READ_FAILED');}})).rejects.toThrow('SYNTHETIC_READ_FAILED');
  await expect(previewSegment(actor,{filter:{}},{preview:async()=>({total:0,items:[],nextCursor:null})})).resolves.toEqual({total:0,items:[],nextCursor:null});
 });
});
