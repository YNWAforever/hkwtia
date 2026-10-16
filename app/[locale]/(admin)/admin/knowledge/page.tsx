import {randomUUID} from "node:crypto";
import {getTranslations,setRequestLocale} from "next-intl/server";
import {KnowledgeWorkspace,type KnowledgeLabels} from "@/components/admin/knowledge-workspace";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {knowledgeGovernanceRepository,knowledgeManagementEnabled} from "@/lib/db/repos/knowledge-governance";
import {localizedPath} from "@/lib/urls";
import {PrivateLink} from "@/components/internal-shell/private-link";
import type {AppLocale} from "@/i18n/routing";
export default async function KnowledgePage({params,searchParams}:Readonly<{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}>){
 const {locale:rawLocale}=await params;const locale=rawLocale as AppLocale;setRequestLocale(locale);const actor=await requireAdminPageActor(localizedPath(locale,"/admin/knowledge"));const t=await getTranslations({locale,namespace:"Knowledge"});const query=await searchParams;const valid=!query.page||/^[1-9]\d{0,2}$/.test(query.page)&&Number(query.page)<=201;const page=valid?Number(query.page??1):1;
 const keys=["heading","description","create","source","newSource","title","url","body","locale","audience","public","staff","effectiveFrom","effectiveTo","reviewDue","facts","factsHelp","save","version","owner","approver","supersedes","indexState","approvalState","contentHash","reviewSource","approve","withdraw","index","empty","noValue","saved","invalid","unavailable","forbidden","disabled","reconcile","configuration","pending","en","zh-HK","unverified","draft","approved","withdrawn","unindexed","indexing","ready","failed","previous","next"] as const;const labels=Object.fromEntries(keys.map(key=>[key,t(key)])) as KnowledgeLabels;
 let result:Awaited<ReturnType<typeof knowledgeGovernanceRepository.listVersions>>|null=null;try{if(valid)result=await knowledgeGovernanceRepository.listVersions(actor,(page-1)*50);}catch{result=null;}
 return <section className="grid min-w-0 gap-6"><h1 className="text-2xl font-semibold">{t("heading")}</h1>{!valid?<p role="alert">{t("invalid")}</p>:!result?<p role="alert">{t("unavailable")}</p>:<><KnowledgeWorkspace labels={labels} versions={result.versions} sourceId={randomUUID()} enabled={knowledgeManagementEnabled()} locale={locale}/><nav aria-label={t("heading")} className="flex gap-4">{page>1?<PrivateLink href={localizedPath(locale,`/admin/knowledge?page=${page-1}`)}>{t("previous")}</PrivateLink>:null}{result.hasMore?<PrivateLink href={localizedPath(locale,`/admin/knowledge?page=${page+1}`)}>{t("next")}</PrivateLink>:null}</nav></>}</section>;
}
