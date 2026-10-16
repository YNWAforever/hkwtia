import {describe,expect,it,vi} from "vitest";
import {runRetryAutomationAction} from "@/lib/admin/automations";
describe("unknown provider effect recovery",()=>{
 it("gives staff reconciliation guidance and does not claim a retry was scheduled",async()=>{
  const form=new FormData();form.set("journeyId","11111111-1111-4111-8111-111111111111");form.set("locale","zh-HK");
  const onSuccess=vi.fn(),retry=vi.fn(async()=>{throw Error("DELIVERY_RECONCILIATION_REQUIRED")});
  expect(await runRetryAutomationAction({},form,{actor:{kind:"staff",profileId:"synthetic",userId:"synthetic-auth"},now:()=>new Date(),retry,onSuccess})).toEqual({status:"error",code:"reconciliation"});
  expect(onSuccess).not.toHaveBeenCalled();expect(retry).toHaveBeenCalledTimes(1);
 });
});
