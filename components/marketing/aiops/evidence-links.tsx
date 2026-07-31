import Link from "next/link";
import type {AppLocale} from "@/i18n/routing";
import type {PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {localizedPath} from "@/lib/urls";
import type {AiOpsDashboardLabels} from "./dashboard";
type Evidence=Readonly<{id:"source"|"commits"|"deployment"|"acceptance";href:string}>;
const valid=(slug:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&slug.length<=200;
export function EvidenceLinks({locale,buildLogs,evidence,labels}:Readonly<{locale:AppLocale;buildLogs:readonly PublishedBuildLogSummary[];evidence:readonly Evidence[];labels:AiOpsDashboardLabels}>){const names={source:labels.source,commits:labels.commits,deployment:labels.deployment,acceptance:labels.acceptance};const links=buildLogs.filter(log=>valid(log.slug)&&!/[\r\n@]/.test(`${log.titleEn}${log.titleZh}${log.author}`));return <section aria-labelledby={`ai-ops-evidence-${locale}`} className="glass-card space-y-4 p-6"><h2 id={`ai-ops-evidence-${locale}`} className="font-serif text-2xl font-semibold">{labels.evidenceHeading}</h2><div><h3 className="font-medium">{labels.buildLogs}</h3>{links.length?<ul className="mt-2 space-y-1">{links.map(log=><li key={log.slug}><Link href={localizedPath(locale,`/news/${log.slug}`)}>{locale==="zh-HK"?log.titleZh:log.titleEn}</Link></li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">{labels.noBuildLogs}</p>}</div><ul className="flex flex-wrap gap-x-5 gap-y-2">{evidence.map(item=><li key={item.id}><a href={item.href} rel="noreferrer">{names[item.id]}</a></li>)}</ul></section>}
