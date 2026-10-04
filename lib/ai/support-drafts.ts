import "server-only";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import {type AdminActor,type Actor} from "@/lib/membership/lifecycle";
import {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {draftWorkRepository} from "@/lib/db/repos/ai-draft-work";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {createDraftGenerationService} from "./drafts/generation";
import {supportCaseId} from "./drafts/support-facts";
import {createAgentRuntime} from "./runtime";
import {configuredAiBudgetLimits} from "@/lib/db/repos/ai-budget";
import {resolveAdminModel,createAdminModelRegistry} from "./providers/registry";
import {DEFAULT_AGENT_MODEL_KEY} from "@/config/ai-pricing";
/** Administrative purpose and data approval are separate from coding credentials. */
export function supportDraftConfiguration(){
 const model=process.env.ADMIN_AI_SUPPORT_MODEL??DEFAULT_AGENT_MODEL_KEY,base=createAdminModelRegistry(model);
 const config={enabled:process.env.ADMIN_AI_DRAFTS_ENABLED==="true"&&process.env.AGENTS_ENABLED==="true"&&process.env.ADMIN_AI_SUPPORT_DRAFTS_ENABLED==="true",model,
 registry:{...base,support:{...base.support,approvedForAdmin:process.env.ADMIN_AI_SUPPORT_PROVIDER_APPROVED==="true"}},
 credentials:{openaiApiKey:process.env.OPENAI_API_KEY,anthropicApiKey:process.env.ANTHROPIC_API_KEY}};
 let ready=false;
 try{const route=resolveAdminModel('support',config.registry);ready=config.enabled&&Boolean(configuredAiBudgetLimits())&&Boolean((route.provider==='openai'?config.credentials.openaiApiKey:config.credentials.anthropicApiKey)?.trim());}catch{/* Unapproved routes remain disabled in the UI. */}
 return {...config,ready};
}
export async function prepareSupportDraft(actor:AdminActor,conversationId:string){
 requireAdmin(actor);const id=z.string().uuid().parse(conversationId),config=supportDraftConfiguration();
 return createDraftGenerationService({kind:'support',promptVersion:'support-reply-v1',drafts:aiDraftsRepository,work:draftWorkRepository,configuration:()=>config,context:(actor,caseId,hash)=>aiDraftsRepository.getSupportContext(actor,caseId.slice(6),hash),
 runtime:runId=>createAgentRuntime({agentRuns:agentRunsRepository,administrativeTask:'support',modelRegistry:config.registry,createRunId:()=>runId})}).prepareDraft(actor,supportCaseId(id));
}
export function createSupportDraftAdoptionService(drafts:Pick<typeof aiDraftsRepository,'withApprovedDraft'>){
 return {async adopt(actor:Actor,conversationId:string,input:unknown){
  requireAdmin(actor);const id=z.string().uuid().parse(conversationId);
  return drafts.withApprovedDraft(actor,input,async(_tx,draft,body)=>{
   if(draft.kind!=='support'||draft.caseId!==supportCaseId(id))throw Error('SUPPORT_DRAFT_CASE_MISMATCH');
   if(body.length>4096)throw Error('SUPPORT_DRAFT_BODY_TOO_LONG');
   // Copy only. No provider, messages/outbox, membership, identity, payment or publish mutation.
   return {body};
  });
 }};
}
export const {adopt:adoptSupportDraft}=createSupportDraftAdoptionService(aiDraftsRepository);
