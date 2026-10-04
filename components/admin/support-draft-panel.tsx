"use client";
import {useState,useTransition} from "react";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
import type en from "@/messages/en.json";
import type {AiDraftDetails} from "@/lib/db/repos/ai-drafts";
import {prepareSupportDraftAction,adoptSupportDraftAction} from "@/lib/admin/support-draft-actions";
export type SupportAssistanceLabels=typeof en.SupportAssistance;
export type SupportAssistance=Readonly<{locale:AppLocale;labels:SupportAssistanceLabels;configured:boolean;enabled:boolean;draft:AiDraftDetails|null;unavailable?:boolean}>;
export function SupportDraftPanel({conversationId,value,onAdopt,dirty=false}:Readonly<{conversationId:string;value:SupportAssistance;onAdopt?:(body:string)=>void;dirty?:boolean}>){
 const [status,setStatus]=useState<string|null>(null),[draftId,setDraftId]=useState(value.draft?.draft.id??null),[pending,start]=useTransition();
 const t=value.labels,draft=value.draft;
 const ready=draft?.draft.state==='approved'&&draft.factsAvailable&&!draft.violations.length&&value.enabled&&Boolean(onAdopt);
 function prepare(){start(async()=>{try{const result=await prepareSupportDraftAction(conversationId);setStatus(result.status);if(result.status==='created')setDraftId(result.draftId);}catch{setStatus('unavailable');}});}
 function adopt(){if(!ready||!draft)return;if(dirty){setStatus('dirty');return;}start(async()=>{try{const result=await adoptSupportDraftAction(conversationId,{draftId:draft.draft.id,expectedVersion:draft.draft.version});setStatus(result.status);if(result.status==='adopted')onAdopt?.(result.body);}catch{setStatus('unavailable');}});}
 const message=status&&status in t?t[status as keyof typeof t]:null;
 return <section className="min-w-0 space-y-4 rounded-lg border border-border p-4" aria-labelledby="support-assistance-title">
  <h2 id="support-assistance-title" className="text-xl font-semibold">{t.title}</h2><p>{t.description}</p>
  <p role="status">{typeof message==='string'?message:value.unavailable?t.unavailable:draft?.draft.state==='stale'?t.stale:!value.enabled?t.disabled:!value.configured?t.configuration:t.manualVerification}</p>
  <div className="flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-60" disabled={pending||!value.enabled||!value.configured} onClick={prepare}>{pending?t.preparing:t.prepare}</button>
   <PrivateLink className="min-h-11 text-primary underline" href={localizedPath(value.locale,'/admin/ai-review'+(draftId?'?'+new URLSearchParams({draft:draftId}):''))}>{t.review}</PrivateLink>
   {draft?<button type="button" className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-60" disabled={pending||!ready||dirty} onClick={adopt}>{pending?t.adopting:t.adopt}</button>:null}
  </div>
  {draft?.analysis?<div className="space-y-3"><h3 className="font-medium">{t.summary}</h3><p className="whitespace-pre-wrap break-words">{draft.analysis.summary}</p><p>{t.category}: {t.categories[draft.analysis.category]}</p><h3 className="font-medium">{t.todos}</h3><ul>{draft.analysis.tasks.map((task,i)=><li key={i} className="break-words">{task}</li>)}</ul></div>:null}
  {!draft?<p>{t.noHistory}</p>:<p>{t.history}: {draft.draft.version} · {t.sourceRefs}: {draft.draft.sourceRefs.length+Object.keys(draft.facts?.recordSources??{}).length}</p>}
 </section>;
}
