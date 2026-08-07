import type {AiOpsDashboardLabels} from "./dashboard";
export function ArchitectureDiagram({labels}:Readonly<{labels:AiOpsDashboardLabels}>){
  // Built from labels, not a module-scope const. As literals these rendered as
  // English on /zh/ai-ops — directly beneath a paragraph that already said
  // 受限制工具 and 已驗證路由 — because `audit:strings` only read JSX text and
  // never saw them. Product names stay English in both bundles.
  const flows=[
    {label:labels.architectureMemberFlow,nodes:[labels.architectureWeb,labels.architectureConciergeRuntime,labels.architectureGuardedTools,labels.architectureDatabase]},
    {label:labels.architectureJobFlow,nodes:[labels.architectureWorker,labels.architectureJobRoutes,labels.architectureScheduledAgents,labels.architectureDatabase]},
  ] as const;
  return <section className="glass-card space-y-5 p-6"><div><h2 className="font-serif text-2xl font-semibold">{labels.architectureHeading}</h2><p className="mt-2 text-muted-foreground">{labels.architectureDescription}</p></div><div className="grid gap-6 md:grid-cols-2">{flows.map((flow)=><ol className="space-y-2" key={flow.label} aria-label={flow.label}>{flow.nodes.map((node,nodeIndex)=><li className="flex items-center gap-2" key={node}><span>{node}</span>{nodeIndex<flow.nodes.length-1?<span aria-hidden="true">→</span>:null}</li>)}</ol>)}</div><div className="flex flex-wrap gap-3"><p className="rounded-full border px-3 py-1 text-sm">{labels.approvalGate}</p><p className="rounded-full border px-3 py-1 text-sm">{labels.publicationGate}</p></div></section>}
