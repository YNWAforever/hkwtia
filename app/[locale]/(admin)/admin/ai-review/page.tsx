import {parseContentCaseId} from "@/lib/ai/drafts/content-facts";
import {getTranslations,setRequestLocale} from "next-intl/server";
import en from "@/messages/en.json";
import {z} from "zod";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {readAiReviewReadiness} from "@/lib/admin/ai-review-readiness";
import {draftKinds,adminAiDraftSchema} from "@/lib/ai/drafts/contracts";
import {AiReviewPanel,type AiDraftReviewLabels} from "@/components/admin/ai-review-panel";
import {AiDraftSelection} from "@/components/admin/ai-draft-selection";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
const filters=z.object({kind:z.enum(draftKinds).optional(),state:adminAiDraftSchema.shape.state.optional(),ownerId:z.string().min(1).max(255).optional(),dueBefore:z.string().datetime({offset:true}).optional(),after:z.string().max(1000).optional(),draft:z.string().uuid().optional()}).strict();
export default async function AiReviewPage({params,searchParams}:Readonly<{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|undefined>>}>){
 const {locale:value}=await params,locale=value as AppLocale;setRequestLocale(locale);const actor=await requireAdminPageActor();
 const t=await getTranslations({locale,namespace:'AiDraftReview'}),h=await getTranslations({locale,namespace:'Admin.jobHealth'});
 const labels=Object.fromEntries(Object.keys(en.AiDraftReview).map(k=>[k,t(k as keyof typeof en.AiDraftReview)])) as AiDraftReviewLabels;
 const enabled=process.env.ADMIN_AI_DRAFTS_ENABLED==='true',readiness=await readAiReviewReadiness(actor),query=await searchParams;
 const parsed=filters.safeParse(Object.fromEntries(Object.entries(query).filter(([,v])=>v!==''&&v!==undefined)));
 let queue:Awaited<ReturnType<typeof aiDraftsRepository.listReviewQueue>>|null=null,detail:Awaited<ReturnType<typeof aiDraftsRepository.getDraft>>|null=null,error=false;
 if(enabled){try{if(!parsed.success)throw Error('INVALID_QUERY');const {draft,...input}=parsed.data;queue=await aiDraftsRepository.listReviewQueue(actor,{...input,limit:50});if(draft)detail=await aiDraftsRepository.getDraft(actor,draft);}catch{error=true;}}
 let contentHref:string|null=null;
 if(detail?.draft.kind==="content"){try{const source=parseContentCaseId(detail.draft.caseId);contentHref=localizedPath(locale,"/admin/"+(source.kind==="event"?"events-mgmt":"news")+"/"+source.id);}catch{/* Malformed historical case identifiers remain reviewable without adoption. */}}
 const next=queue?.nextCursor&&parsed.success?new URLSearchParams({...parsed.data,after:queue.nextCursor}):null;
 return <div className="space-y-6"><header className="space-y-3"><h1 className="text-3xl font-semibold">{labels.heading}</h1><p>{labels.description}</p></header>
 <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3"><div><dt>{labels.approvedModel}</dt><dd>{readiness.model??labels.modelUnavailable}</dd></div><div><dt>{labels.budgetRemaining}</dt><dd>{readiness.remainingDayMicrousd??labels.unknownCost}</dd></div><div><dt>{labels.workerReadiness}</dt><dd>{readiness.workers?['healthy','degraded','disabled','unknown'].map(state=>`${h('states.'+state as 'states.healthy')} ${readiness.workers!.filter(w=>w.state===state).length}`).join(' · '):labels.unknownReadiness}<br/><PrivateLink className="underline" href={localizedPath(locale,'/admin/automations#verified-worker-health')}>{h('heading')}</PrivateLink></dd></div></dl>
 <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><label>{labels.kind}<select name="kind" defaultValue={query.kind??''} className="min-h-11 w-full rounded-md border"><option value="">{labels.all}</option>{draftKinds.map(k=><option key={k} value={k}>{labels[k+'Kind' as keyof AiDraftReviewLabels]}</option>)}</select></label><label>{labels.stateFilter}<select name="state" defaultValue={query.state??''} className="min-h-11 w-full rounded-md border"><option value="">{labels.all}</option>{adminAiDraftSchema.shape.state.options.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label><label>{labels.owner}<input name="ownerId" defaultValue={query.ownerId??''} className="min-h-11 w-full rounded-md border"/></label><label>{labels.dueBefore}<input name="dueBefore" defaultValue={query.dueBefore??''} aria-describedby="ai-review-deadline-help" placeholder="2026-10-31T17:00:00+08:00" className="min-h-11 w-full rounded-md border"/><span id="ai-review-deadline-help" className="block text-sm text-muted-foreground">{labels.dueBeforeHelp}</span></label><button className="min-h-11 rounded-md border px-4" type="submit">{labels.applyFilters}</button></form>
 {!enabled?<p>{labels.disabled} {labels.manualFallback}</p>:error?<p role="alert">{labels.unavailable}</p>:queue?.items.length?<AiDraftSelection key={JSON.stringify(parsed.success?parsed.data:{})} items={queue.items} locale={locale} labels={labels} enabled={enabled}/>:<p>{labels.empty} {labels.manualFallback}</p>}
 {next?<PrivateLink className="min-h-11 underline" href={localizedPath(locale,'/admin/ai-review?'+next)}>{labels.next}</PrivateLink>:null}
 {detail?<><AiReviewPanel key={`${detail.draft.id}:${detail.draft.version}`} details={detail} labels={labels} enabled={enabled}/>{contentHref?<PrivateLink className="min-h-11 underline" href={contentHref}>{labels.openContent}</PrivateLink>:null}{detail.draft.kind==='support'&&detail.draft.caseId.startsWith('inbox:')&&z.string().uuid().safeParse(detail.draft.caseId.slice(6)).success?<PrivateLink className="min-h-11 underline" href={localizedPath(locale,'/admin/inbox/'+detail.draft.caseId.slice(6)+'?'+new URLSearchParams({draft:detail.draft.id}))}>{labels.openConversation}</PrivateLink>:null}</>:null}
 </div>;
}
