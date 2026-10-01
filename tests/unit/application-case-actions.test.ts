import {beforeEach,describe,expect,it,vi} from "vitest";
const authenticated=vi.hoisted(()=>vi.fn());
const update=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/auth/actor",()=>({requireAdminActor:authenticated}));vi.mock("@/lib/admin/application-case-service",()=>({updateApplicationCase:update}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {updateApplicationCaseAction} from "@/lib/admin/application-case-actions";
const actor={kind:"staff",userId:"auth-staff",profileId:"profile-staff"} as const;
function form(due="2026-10-02T14:30"){const data=new FormData();for(const[key,value]of Object.entries({expectedVersion:"0",ownerProfileId:"",dueAt:due,nextActionCode:"await_documents",note:"Synthetic note"}))data.set(key,value);return data;}
describe("application case action validation and independent actor",()=>{
 beforeEach(()=>{vi.clearAllMocks();authenticated.mockResolvedValue(actor);update.mockResolvedValue({version:"10000000-0000-4000-8000-000000000001"});});
 it("rejects impossible Hong Kong dates without silently normalizing them",async()=>{expect(await updateApplicationCaseAction("case-id","en",{status:"idle"},form("2026-02-31T14:30"))).toEqual({status:"error"});expect(update).not.toHaveBeenCalled();});
 it("uses its own authenticated actor, and converts a valid explicit HKT due time",async()=>{const data=form();data.set("actor",JSON.stringify({kind:"superadmin"}));expect((await updateApplicationCaseAction("case-id","zh-HK",{status:"idle"},data)).status).toBe("saved");expect(update).toHaveBeenCalledWith(actor,"case-id",expect.objectContaining({dueAt:"2026-10-02T06:30:00.000Z",expectedVersion:"0"}));});
 it("authentication denial cannot fall through to a privileged writer",async()=>{authenticated.mockRejectedValue(new Error("FORBIDDEN"));await expect(updateApplicationCaseAction("case-id","en",{status:"idle"},form())).rejects.toThrow("FORBIDDEN");expect(update).not.toHaveBeenCalled();});
 it("preserves conflict and validation states rather than reporting success",async()=>{update.mockRejectedValue(new Error("APPLICATION_CASE_VERSION_CONFLICT"));expect((await updateApplicationCaseAction("case-id","en",{status:"idle"},form())).status).toBe("conflict");update.mockClear();expect((await updateApplicationCaseAction("case-id","en",{status:"idle"},form("tomorrow"))).status).toBe("error");expect(update).not.toHaveBeenCalled();});
});
