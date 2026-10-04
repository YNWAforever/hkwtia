"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
import type {AiDraftReviewLabels} from "./ai-review-panel";
import type {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {reviewAiDraftSelectionAction} from "@/lib/admin/ai-draft-actions";
import type {SelectionResult} from "@/lib/admin/ai-draft-selection";
type Item=Awaited<ReturnType<typeof aiDraftsRepository.listReviewQueue>>['items'][number];
export function AiDraftSelection({items,locale,labels,enabled}:Readonly<{items:readonly Item[];locale:AppLocale;labels:AiDraftReviewLabels;enabled:boolean}>){
 const router=useRouter(),[selected,setSelected]=useState<ReadonlySet<string>>(new Set()),[results,setResults]=useState<readonly SelectionResult[]>([]),[message,setMessage]=useState<string|null>(null),[pending,start]=useTransition();
 const chosen=items.filter(i=>selected.has(i.id)),kinds=new Set(chosen.map(i=>i.kind)),ready=enabled&&!pending&&chosen.length>0&&kinds.size===1;
 function review(decision:'approve'|'reject'){if(!ready)return;start(async()=>{try{
  const r=await reviewAiDraftSelectionAction({kind:chosen[0]!.kind,decision,items:chosen.map(i=>({draftId:i.id,expectedVersion:i.version}))});
  if(r.status==='results'){setResults(r.items);setSelected(new Set());router.refresh();}else setMessage(labels[r.status]);
 }catch{setMessage(labels.unavailable);}});}
 return <div className="space-y-4"><ul className="space-y-3">{items.map((item,i)=><li key={item.id} className="min-w-0 rounded-lg border p-3"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" aria-label={`${labels.select} ${i+1}`} checked={selected.has(item.id)} disabled={pending||!enabled||!['proposed','needs_review'].includes(item.state)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(item.id);else next.delete(item.id);return next;})}/><span>{labels[item.kind+'Kind' as keyof AiDraftReviewLabels]} · {labels[item.state]}</span></label><PrivateLink className="min-h-11 underline" href={localizedPath(locale,'/admin/ai-review?'+new URLSearchParams({draft:item.id}))}>{labels.open} · {labels.version} {item.version}</PrivateLink><p className="break-all text-sm">{labels.owner}: {item.ownerId??labels.noValue} · {labels.due}: {item.dueAt??labels.noValue}</p></li>)}</ul>
 <p>{labels.selected}: {chosen.length}</p>{kinds.size>1?<p role="alert">{labels.mixedKinds}</p>:null}
 <div className="flex flex-wrap gap-3"><button type="button" disabled={!ready} onClick={()=>review('approve')} className="min-h-11 rounded-md border px-4 disabled:opacity-60">{labels.reviewSelected}</button><button type="button" disabled={!ready} onClick={()=>review('reject')} className="min-h-11 rounded-md border px-4 disabled:opacity-60">{labels.rejectSelected}</button></div>
 {message?<p role="status">{message}</p>:null}{results.length?<section aria-label={labels.results}><h3>{labels.results}</h3><ul>{results.map((r,i)=><li key={r.draftId}>{labels.select} {i+1}: {labels[r.status]}</li>)}</ul></section>:null}
 </div>;
}
