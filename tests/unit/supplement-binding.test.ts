import {describe,it,expect,vi} from 'vitest';
import {createSupplementBinding} from '@/lib/membership/supplement-binding';
import {createSupplementService, type SupplementState} from '@/lib/membership/supplement-service';
import {randomUUID} from 'node:crypto';
const staff={kind:'staff' as const,profileId:'staff',userId:'staff'};
const member={kind:'member' as const,profileId:'a',userId:'a'};
describe('supplement form binding',()=>{
 it('fails closed before session or repository work when disabled',async()=>{
  const actor=vi.fn(async()=>staff); const transaction=vi.fn();
  const binding=createSupplementBinding({enabled:()=>false,actor,repository:{transaction}});
  expect(await binding.publish({})).toEqual({status:'forbidden'});
  expect(actor).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
 });
 it('resolves actor on every call, ignores forged actor payload and binds real service validation',async()=>{
  const app=randomUUID();
  const state:SupplementState={applications:[{id:app,applicantUserId:'a',status:'pending_review'}],requests:[],responses:[],receipts:[],audits:[]};
  const repository={transaction:async<T>(work:(s:SupplementState)=>Promise<T>)=>work(state)};
  const service=createSupplementService(repository);
  const draft=await service.createSupplementDraft(staff,{applicationId:app,operationRequestId:randomUUID(),items:[{itemId:'x',label:'Synthetic',required:true}],dueAt:null});
  if(draft.status!=='saved') throw Error('DRAFT_FAILED');
  let current=staff as typeof staff | typeof member;
  const actor=vi.fn(async()=>current);
  const binding=createSupplementBinding({enabled:()=>true,actor,repository});
  const publish={requestId:draft.reference.requestId,expectedVersion:1,operationRequestId:randomUUID()};
  current=member;
  expect(await binding.publish({...publish,actor:staff})).toEqual({status:'forbidden'});
  current=staff;
  expect(await binding.publish(publish)).toMatchObject({status:'saved'});
  current=member;
  expect(await binding.respond({...publish,expectedVersion:2,operationRequestId:randomUUID(),answers:[{itemId:'x',text:'Synthetic response'}]})).toMatchObject({status:'saved'});
  expect(state.responses).toHaveLength(1);expect(actor).toHaveBeenCalledTimes(3);
 });
});
