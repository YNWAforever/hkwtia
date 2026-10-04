import "server-only";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor} from "@/lib/membership/lifecycle";
import {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {draftKinds} from "@/lib/ai/drafts/contracts";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
export const draftSelectionSchema=z.object({kind:z.enum(draftKinds),decision:z.enum(['approve','reject']),items:z.array(z.object({draftId:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict()).min(1).max(100).refine(a=>new Set(a.map(i=>i.draftId)).size===a.length)}).strict();
export type SelectionResult=Readonly<{draftId:string;status:'saved'|'stale'|'invalid'|'forbidden'|'unavailable'}>;
/** A reviewed selection is metadata only. It never sends or adopts any item. */
export async function reviewDraftSelection(actor:Actor,input:unknown,repo:Pick<typeof aiDraftsRepository,'getDraft'|'reviewDraft'>=aiDraftsRepository):Promise<SelectionResult[]>{
 requireAdmin(actor);const value=draftSelectionSchema.parse(input);
 const preflight:({id:string;kind:string}|SelectionResult)[]=[];
 for(const item of value.items){try{const detail=await repo.getDraft(actor,item.draftId);preflight.push({id:item.draftId,kind:detail.draft.kind});}catch(error){preflight.push({draftId:item.draftId,status:isAuthorizationDenial(error)?'forbidden':'unavailable'});}}
 // Mixed business kinds are refused before any decision is written.
 if(preflight.some(x=>'kind' in x&&x.kind!==value.kind))return value.items.map(x=>({draftId:x.draftId,status:'invalid'}));
 const results:SelectionResult[]=[];
 for(let i=0;i<value.items.length;i++){
  const item=value.items[i]!,checked=preflight[i]!;if('status' in checked){results.push(checked);continue;}
  try{const r=await repo.reviewDraft(actor,{...item,decision:value.decision});results.push({draftId:item.draftId,status:r.status==='reviewed'?'saved':r.status});}
  catch(error){const code=error instanceof Error?error.message:'';results.push({draftId:item.draftId,status:isAuthorizationDenial(error)?'forbidden':/VERSION_CONFLICT|STATE_CONFLICT/.test(code)?'stale':'unavailable'});}
 }
 return results;
}
