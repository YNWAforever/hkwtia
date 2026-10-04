"use server";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {z} from "zod";
import {prepareSupportDraft,adoptSupportDraft} from "@/lib/ai/support-drafts";
function failure(error:unknown){
 if(isAuthorizationDenial(error))return {status:'forbidden' as const};
 const code=error instanceof Error?error.message:'';
 if(code==='DRAFT_GENERATION_DISABLED')return {status:'disabled' as const};
 if(code==='DRAFT_GENERATION_UNKNOWN_EFFECT')return {status:'unknown' as const};
 if(code==='DRAFT_GENERATION_BUSY')return {status:'busy' as const};
 if(/^(?:AI_DRAFT_(?:VERSION_CONFLICT|NOT_APPROVED)|DRAFT_GENERATION_STALE)$/.test(code))return {status:'stale' as const};
 if(/^AGENT_|CONFIGURATION|FACT_READER_UNAVAILABLE/.test(code))return {status:'configuration' as const};
 return {status:'unavailable' as const};
}
export async function prepareSupportDraftAction(conversationId:string){
 try{const actor=await requireAdminActor();const id=z.string().uuid().safeParse(conversationId);if(!id.success)return {status:'invalid' as const};
 const draft=await prepareSupportDraft(actor,id.data);return {status:'created' as const,draftId:draft.id,version:draft.version};
 }catch(error){return failure(error);}
}
export async function adoptSupportDraftAction(conversationId:string,input:unknown){
 try{const actor=await requireAdminActor();const id=z.string().uuid().safeParse(conversationId);if(!id.success)return {status:'invalid' as const};
 if(process.env.ADMIN_AI_DRAFTS_ENABLED!=="true")return {status:'disabled' as const};
 const result=await adoptSupportDraft(actor,id.data,input);return result.status==='adopted'?{status:'adopted' as const,body:result.value.body}:{status:'stale' as const};
 }catch(error){return failure(error);}
}
