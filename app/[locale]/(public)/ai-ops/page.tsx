import type {Metadata} from "next";
import {getTranslations,setRequestLocale} from "next-intl/server";
import {AiOpsDashboard,type AiOpsDashboardLabels} from "@/components/marketing/aiops/dashboard";
import {AI_OPS_EXTERNAL_EVIDENCE} from "@/config/aiops-evidence";
import type {AppLocale} from "@/i18n/routing";
import {buildAiOpsDashboardState,unavailableAiOpsDashboardState} from "@/lib/aiops/dashboard";
import {aiOpsPublicRepository} from "@/lib/db/repos/aiops-public";
import {publicPostsRepository} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";
type Props={params:Promise<{locale:string}>}; export const revalidate=300;
const keys=["eyebrow","title","description","currentMonth","partialMonth","lastUpdated","fresh","stale","empty","unavailable","notEnoughData","conversations","resolved","firstResponse","csat","escalation","failure","hoursSaved","llmCost","responses","samples","hours","resolutionTarget","csatTarget","renewalHeading","overallRenewal","firstYearRenewal","overallTarget","firstYearTarget","renewalChartTitle","renewalChartDescription","month","paid","due","rate","methodologyHeading","methodologyDescription","architectureHeading","architectureDescription","approvalGate","publicationGate","evidenceHeading","buildLogs","source","commits","deployment","acceptance","noBuildLogs"] as const;
async function labels(locale:string):Promise<AiOpsDashboardLabels>{const t=await getTranslations({locale,namespace:"AiOps"});return Object.fromEntries(keys.map(key=>[key,t(key)])) as AiOpsDashboardLabels}
function safe(rows:Awaited<ReturnType<typeof publicPostsRepository.listPublishedBuildLogs>>){return rows.filter(row=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)&&!/[\r\n@]/.test(`${row.titleEn}${row.titleZh}${row.author}`))}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:"AiOps"});return buildPageMetadata({locale:locale as AppLocale,pathname:"/ai-ops",title:t("metaTitle"),description:t("metaDescription")})}
export default async function AiOpsPage({params}:Props){const {locale}=await params;setRequestLocale(locale);const [rows,published,uiLabels]=await Promise.all([aiOpsPublicRepository.readLatestTwelveMonths().catch(()=>null),publicPostsRepository.listPublishedBuildLogs().catch(()=>[]),labels(locale)]);const state=rows?buildAiOpsDashboardState(rows,new Date()):unavailableAiOpsDashboardState();return <AiOpsDashboard locale={locale as AppLocale} state={state} buildLogs={safe(published)} evidence={AI_OPS_EXTERNAL_EVIDENCE} labels={uiLabels}/>}
