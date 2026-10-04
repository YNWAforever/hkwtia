import "server-only";
import {createHash} from "node:crypto";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import {forbidden,type AdminActor} from "@/lib/membership/lifecycle";
import type {AiDraftExecutor} from "@/lib/db/repos/ai-drafts";
import type {ApprovedFactPack} from "./contracts";
import {approvedFactsHash} from "./validation";
import {draftFactLabels} from "./fact-labels";
import {replyWindow} from "@/lib/admin/inbox-action-core";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
export const supportCaseId=(id:string)=>"inbox:"+z.string().uuid().parse(id);
function rows(v:unknown):Record<string,unknown>[] {
 if(Array.isArray(v))return v;
 if(v&&typeof v==='object'&&'rows' in v&&Array.isArray(v.rows))return v.rows;
 throw Error('AI_DRAFT_SQL_RESULT_INVALID');
}
/** A strict server allowlist of intent codes. No freeform text, names, identifiers,
 * contact details, amounts, dates, links, attachment bytes or payment fragments leave the app. */
export function supportMessageSignals(input:Readonly<{role:string;content:unknown}>) {
 const text=typeof input.content==='string'?input.content:'';
 const intents:string[]=[];
 for(const [code,pattern] of [
  ['membership',/membership|join|會籍|入會/iu],['renewal',/renew|續會|續期/iu],
  ['event',/event|ticket|活動|門票/iu],['billing',/pay|refund|invoice|付款|退款|發票/iu],
  ['privacy',/email|phone|other member|另一.{0,4}會員|電郵|電話/iu],
 ] as const)if(pattern.test(text))intents.push(code);
 return {role:['user','staff','assistant'].includes(input.role)?input.role:'other',
  intents:intents.length?intents:['unknown'],
  manualVerification:/refund|other.{0,20}(email|member)|退款|別人|另一.{0,4}會員/iu.test(text),
  sensitiveInput:/@|\p{Nd}|https?:|attachment|附件|token|password|密碼/iu.test(text),
  instructionAttempt:/ignore|system:|developer:|忽略|無視|規則|policy/iu.test(text)};
}
export async function readSupportDraftSource(actor:AdminActor,idValue:string,tx:AiDraftExecutor,asOf:Date){
 requireAdmin(actor);const id=z.string().uuid().parse(idValue);
 const record=rows(await tx.execute(sql`SELECT c.id,c.agent_kind,c.locale,c.status,c.channel,c.handling,c.profile_id,c.contact_id,c.assigned_to_profile_id,c.last_inbound_at,
  p.whatsapp_opt_in AS profile_opt_in,p.whatsapp_number AS profile_recipient,
  ct.whatsapp_opt_in AS contact_opt_in,ct.whatsapp_opted_out_at AS contact_opt_out,ct.phone_e164 AS contact_recipient,
  EXISTS(SELECT 1 FROM message_suppressions s WHERE s.profile_id=c.profile_id AND s.channel='whatsapp') AS suppressed
  FROM conversations c LEFT JOIN profiles p ON p.id=c.profile_id LEFT JOIN contacts ct ON ct.id=c.contact_id
  WHERE c.id=${id} AND c.status<>'deleted' FOR SHARE OF c`))[0];
 if(!record)throw Error('AI_DRAFT_CASE_UNAVAILABLE');
 // Existing inbox admin ownership is shared; this never opens private Writer/retention histories.
 if(record.agent_kind!=='concierge')forbidden();
 const messages=rows(await tx.execute(sql`SELECT id,role,direction,content,delivery_status,error_code,created_at FROM messages WHERE conversation_id=${id} ORDER BY created_at DESC,id DESC LIMIT 20`));
 const locale=z.enum(['en','zh-HK']).parse(record.locale),bundle=locale==='en'?en:zh;
 const window=replyWindow(record.last_inbound_at?new Date(String(record.last_inbound_at)):null,asOf);
 const labels=bundle.SupportAssistance,sourceId='db:support:'+id;
 const optedIn=!record.suppressed&&(record.profile_id?record.profile_opt_in:true)&&(record.contact_id?record.contact_opt_in&&!record.contact_opt_out:true);
 const value=(v:string,label:string)=>({value:v,label,sourceId,format:'text' as const});
 const facts:ApprovedFactPack={caseId:supportCaseId(id),locale,asOf:asOf.toISOString(),versionHash:'0'.repeat(64),
  values:{handling:value(bundle.Admin.inbox.handling[record.handling as 'human'|'bot'|'closed'],labels.handling),
   replyWindow:value(labels.windows[window.state],labels.window),consent:value(optedIn?labels.consentPresent:labels.consentMissing,labels.consent),
   nextAction:value(labels.manualVerification,labels.nextAction)},
  recordSources:{[sourceId]:createHash('sha256').update(JSON.stringify({record,messages,window:window.state})).digest('hex')},
  sourceRefs:[],sourceUrls:{},displayLabels:draftFactLabels(locale).displayLabels,comparisonAvailable:null};
 return {facts:{...facts,versionHash:approvedFactsHash(facts)},context:{messages:messages.reverse().map(m=>supportMessageSignals({role:String(m.role),content:m.content})),attachmentPolicy:'never-export',factsPolicy:'server-values-only'}};
}
