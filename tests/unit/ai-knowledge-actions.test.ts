// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {AuthorizationError} from "@/lib/membership/lifecycle";
const mocks=vi.hoisted(()=>({actor:vi.fn(),enabled:vi.fn(),create:vi.fn(),review:vi.fn(),index:vi.fn()}));
vi.mock("@/lib/auth/actor",()=>({requireAdminActor:mocks.actor}));
vi.mock("@/lib/db/repos/knowledge-governance",async()=>{const original=await vi.importActual<typeof import("@/lib/db/repos/knowledge-governance")>("@/lib/db/repos/knowledge-governance");return {...original,knowledgeManagementEnabled:mocks.enabled,knowledgeGovernanceRepository:{createVersion:mocks.create,reviewVersion:mocks.review,indexVersion:mocks.index}};});
import {createKnowledgeVersionAction,reviewKnowledgeVersionAction,indexKnowledgeVersionAction} from "@/lib/admin/knowledge-actions";
const actor={kind:"staff",profileId:"trusted-staff",userId:"trusted-auth"} as const;
const source={sourceId:"11111111-1111-4111-8111-111111111111",locale:"en",version:1};
const version={sourceId:source.sourceId,locale:"en",expectedVersion:0,namespace:"m4a-core-v1",title:"Synthetic policy",url:"https://example.test/policy",content:"Manual review only.",audience:"staff",effectiveFrom:"2040-01-01T00:00:00Z",effectiveTo:null,reviewDue:"2041-01-01T00:00:00Z",structuredFacts:{}};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue(actor);mocks.enabled.mockReturnValue(true);mocks.create.mockResolvedValue({});mocks.review.mockResolvedValue({});mocks.index.mockResolvedValue({});});
describe("knowledge server actions",()=>{
 it.each([[createKnowledgeVersionAction,version],[reviewKnowledgeVersionAction,{...source,decision:"approve"}],[indexKnowledgeVersionAction,source]] as const)("rejects unauthenticated requests before repository access",async(action,input)=>{mocks.actor.mockRejectedValue(new AuthorizationError());expect(await action(input)).toEqual({status:"forbidden"});expect(mocks.create).not.toHaveBeenCalled();expect(mocks.review).not.toHaveBeenCalled();expect(mocks.index).not.toHaveBeenCalled();});
 it("rejects client-supplied actor even after authenticating the trusted staff session",async()=>{expect(await createKnowledgeVersionAction({...version,actor:{kind:"superadmin",profileId:"forged"}})).toEqual({status:"invalid"});expect(mocks.actor).toHaveBeenCalledOnce();expect(mocks.create).not.toHaveBeenCalled();});
 it("passes only its own actor and strict source input",async()=>{expect(await createKnowledgeVersionAction(version)).toEqual({status:"saved"});expect(mocks.create).toHaveBeenCalledWith(actor,version);});
 it("disabled mutations still authenticate and never access the repository",async()=>{mocks.enabled.mockReturnValue(false);expect(await indexKnowledgeVersionAction(source)).toEqual({status:"disabled"});expect(mocks.actor).toHaveBeenCalledOnce();expect(mocks.index).not.toHaveBeenCalled();});
 it("configuration and uncertain-index failures are explicit and content-free",async()=>{mocks.review.mockRejectedValue(Error("KNOWLEDGE_APPROVER_CONFIGURATION_REQUIRED"));expect(await reviewKnowledgeVersionAction({...source,decision:"approve"})).toEqual({status:"configuration"});mocks.index.mockRejectedValue(Error("KNOWLEDGE_INDEX_RECONCILIATION_REQUIRED"));expect(await indexKnowledgeVersionAction(source)).toEqual({status:"reconcile"});});
 it("self-approval cannot be treated as saved",async()=>{mocks.review.mockRejectedValue(Error("KNOWLEDGE_SELF_APPROVAL_FORBIDDEN"));expect(await reviewKnowledgeVersionAction({...source,decision:"approve"})).toEqual({status:"forbidden"});});
});
