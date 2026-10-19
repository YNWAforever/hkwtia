import {beforeEach,describe,expect,it,vi} from "vitest";
import {revalidatePath} from "next/cache";
const authenticated=vi.hoisted(()=>vi.fn());
const update=vi.hoisted(()=>vi.fn());
const findSaved=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/auth/actor",()=>({requireAdminActor:authenticated}));vi.mock("@/lib/admin/application-case-service",()=>({updateApplicationCase:update,getApplicationCaseSaveResult:findSaved}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {checkApplicationCaseSaveAction, updateApplicationCaseAction} from "@/lib/admin/application-case-actions";
const actor={kind:"staff",userId:"auth-staff",profileId:"profile-staff"} as const;
function form(due="2026-10-02T14:30"){const data=new FormData();for(const[key,value]of Object.entries({expectedVersion:"0",ownerProfileId:"",dueAt:due,nextActionCode:"await_documents",note:"Synthetic note"}))data.set(key,value);return data;}
describe("application case action validation and independent actor",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(revalidatePath).mockReset();findSaved.mockReset();findSaved.mockResolvedValue(null);authenticated.mockResolvedValue(actor);update.mockResolvedValue({version:"10000000-0000-4000-8000-000000000001"});});
 it("rejects impossible Hong Kong dates without silently normalizing them",async()=>{expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},form("2026-02-31T14:30"))).toEqual({status:"error"});expect(update).not.toHaveBeenCalled();});
 it("uses its own authenticated actor, and converts a valid explicit HKT due time",async()=>{const data=form();data.set("actor",JSON.stringify({kind:"superadmin"}));expect((await updateApplicationCaseAction("case-id","zh-HK",{status:"idle"},data)).status).toBe("saved");expect(update).toHaveBeenCalledWith(actor,"case-id",expect.objectContaining({dueAt:"2026-10-02T06:30:00.000Z",expectedVersion:"0"}));});
 it("authentication denial cannot fall through to a privileged writer",async()=>{authenticated.mockRejectedValue(new Error("FORBIDDEN"));await expect(updateApplicationCaseAction("case-id","en",{status:"idle"},form())).rejects.toThrow("FORBIDDEN");expect(update).not.toHaveBeenCalled();});
 it("preserves conflict and validation states rather than reporting success",async()=>{update.mockRejectedValue(new Error("APPLICATION_CASE_VERSION_CONFLICT"));expect((await updateApplicationCaseAction("case-id","en",{status:"idle"},form())).status).toBe("conflict");update.mockClear();expect((await updateApplicationCaseAction("case-id","en",{status:"idle"},form("tomorrow"))).status).toBe("error");expect(update).not.toHaveBeenCalled();});
 it("keeps an acknowledged commit saved when cache invalidation subsequently fails",async()=>{
  vi.mocked(revalidatePath).mockImplementation(()=>{throw new Error("SYNTHETIC_REFRESH_FAILED");});
  expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},form())).toMatchObject({
   status:"saved",version:"10000000-0000-4000-8000-000000000001",refreshRequired:true,
  });
  expect(update).toHaveBeenCalledOnce();
 });
 it("passes the stable logical request identity to the authenticated writer",async()=>{
  const data=form();data.set("requestId","70000000-0000-4000-8000-000000000001");
  await updateApplicationCaseAction("case-id","en",{status:"idle"},data);
  expect(update).toHaveBeenCalledWith(actor,"case-id",expect.objectContaining({requestId:"70000000-0000-4000-8000-000000000001"}));
 });
 it("does not claim a failed write when the commit result cannot be determined",async()=>{
  update.mockRejectedValue(new Error("SYNTHETIC_COMMIT_ACK_LOST"));
  const data=form();data.set("requestId","70000000-0000-4000-8000-000000000001");
  expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},data)).toMatchObject({status:"unknown"});
  expect(update).toHaveBeenCalledOnce();
 });
 it("recovers the original saved receipt after losing the commit acknowledgement",async()=>{
  update.mockRejectedValue(new Error("SYNTHETIC_COMMIT_ACK_LOST"));
  findSaved.mockResolvedValue({version:"10000000-0000-4000-8000-000000000001"});
  const data=form();data.set("requestId","70000000-0000-4000-8000-000000000001");
  expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},data)).toMatchObject({
   status:"saved",version:"10000000-0000-4000-8000-000000000001",refreshRequired:true,
  });
  expect(update).toHaveBeenCalledOnce();
 });
 it("keeps an unreadable receipt unknown without trying a second write",async()=>{
  update.mockRejectedValue(new Error("SYNTHETIC_COMMIT_ACK_LOST"));
  findSaved.mockRejectedValue(new Error("SYNTHETIC_RECEIPT_READ_FAILED"));
  const data=form();data.set("requestId","70000000-0000-4000-8000-000000000001");
  expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},data)).toMatchObject({status:"unknown"});
  expect(update).toHaveBeenCalledOnce();
 });
 it("checks an uncertain result with an independent actor and no writer",async()=>{
  const id="70000000-0000-4000-8000-000000000001";
  findSaved.mockResolvedValue({version:"10000000-0000-4000-8000-000000000001"});
  expect(await checkApplicationCaseSaveAction("case-id",id)).toMatchObject({status:"saved",refreshRequired:true});
  expect(authenticated).toHaveBeenCalledOnce();
  expect(findSaved).toHaveBeenCalledWith(actor,"case-id",id);
  expect(update).not.toHaveBeenCalled();
 });
 it("does not turn an absent or unavailable readback into a failed save",async()=>{
  const id="70000000-0000-4000-8000-000000000001";
  expect(await checkApplicationCaseSaveAction("case-id",id)).toMatchObject({status:"unknown"});
  findSaved.mockRejectedValue(new Error("SYNTHETIC_READBACK_FAILED"));
  expect(await checkApplicationCaseSaveAction("case-id",id)).toMatchObject({status:"unknown"});
  expect(update).not.toHaveBeenCalled();
 });
 it("cannot read a receipt when authentication fails",async()=>{
  authenticated.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(checkApplicationCaseSaveAction("case-id","70000000-0000-4000-8000-000000000001")).rejects.toThrow("FORBIDDEN");
  expect(findSaved).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
 });
});
