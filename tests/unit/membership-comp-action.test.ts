import {describe,expect,it,vi} from 'vitest';
import {runCompMembershipAction} from '@/lib/admin/membership-comp-action-core';
describe('stale comp adapters',()=>{
 it.each([{}, {profileId:'synthetic',planCode:'community'}, {profileId:'synthetic',planCode:'corporate',actor:'forged'}])('never executes the legacy mutation (%j)',async input=>{
  const form=new FormData();for(const[key,value]of Object.entries(input))form.set(key,value);
  const mutate=vi.fn();const state=await runCompMembershipAction({},form,{mutate,successMessage:'done',validationMessage:'invalid',duplicateMessage:'duplicate',errorMessage:'error',retiredMessage:'Use a finite grant'});
  expect(state).toEqual({status:'error',code:'LEGACY_COMP_RETIRED',message:'Use a finite grant'});expect(mutate).not.toHaveBeenCalled();
 });
});
