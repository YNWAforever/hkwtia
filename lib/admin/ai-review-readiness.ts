import "server-only";
import {requireAdmin} from "@/lib/auth/authorize";
import type {AdminActor} from "@/lib/membership/lifecycle";
import {aiBudgetRepository} from "@/lib/db/repos/ai-budget";
import {supportDraftConfiguration} from "@/lib/ai/support-drafts";
import {readJobHealth} from "@/lib/jobs/health";
/** Readiness only. No model dispatch, credential serialization, artificial zero cost or worker success. */
export async function readAiReviewReadiness(actor:AdminActor,now=new Date()){
 requireAdmin(actor);let model:string|null=null,remainingDayMicrousd:number|null=null;
 try{const cfg=supportDraftConfiguration();if(cfg.ready)model=cfg.model;}catch{/* Unapproved/invalid routes remain unknown. */}
 if(process.env.ADMIN_AI_DRAFTS_ENABLED==='true')try{remainingDayMicrousd=await aiBudgetRepository.readRemainingDay(actor,now);}catch{/* Unavailable is not zero. */}
 let workers:Awaited<ReturnType<typeof readJobHealth>>|null=null;try{workers=await readJobHealth(actor);}catch{/* Keep manual work available. */}
 return {model,remainingDayMicrousd,workers};
}
