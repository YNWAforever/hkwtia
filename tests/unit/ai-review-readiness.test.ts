// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from "vitest";
vi.mock("@/lib/jobs/health",()=>({readJobHealth:async()=>null}));
vi.mock("@/lib/db/repos/common",()=>({getDb:async()=>({execute:async()=>({rows:[{spent:"0"}]})})}));
import {readAiReviewReadiness} from "@/lib/admin/ai-review-readiness";
const actor={kind:"staff",profileId:"synthetic",userId:"synthetic-auth"} as const;
beforeEach(()=>{for(const [name,value] of Object.entries({AGENTS_ENABLED:"true",ADMIN_AI_DRAFTS_ENABLED:"true",ADMIN_AI_SUPPORT_DRAFTS_ENABLED:"true",ADMIN_AI_SUPPORT_PROVIDER_APPROVED:"true",ADMIN_AI_SUPPORT_MODEL:"openai:gpt-5.4-mini",OPENAI_API_KEY:"synthetic-test-key",ANTHROPIC_API_KEY:"",AI_BUDGET_RUN_MICROUSD:"1000",AI_BUDGET_DAY_MICROUSD:"10000",AI_BUDGET_MONTH_MICROUSD:"30000"}))vi.stubEnv(name,value);});
afterEach(()=>vi.unstubAllEnvs());
it("an unmatched credential does not claim the approved model is ready",async()=>{vi.stubEnv("OPENAI_API_KEY","");vi.stubEnv("ANTHROPIC_API_KEY","synthetic-wrong-provider");expect((await readAiReviewReadiness(actor)).model).toBeNull();});
it("missing any financial cap does not claim the model is ready",async()=>{vi.stubEnv("AI_BUDGET_MONTH_MICROUSD","");expect((await readAiReviewReadiness(actor)).model).toBeNull();});
it("unapproved administrative purpose does not claim readiness",async()=>{vi.stubEnv("ADMIN_AI_SUPPORT_PROVIDER_APPROVED","false");expect((await readAiReviewReadiness(actor)).model).toBeNull();});
