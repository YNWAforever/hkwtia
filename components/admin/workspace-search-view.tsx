import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import {WORKSPACE_KINDS} from "@/lib/admin/workspace-search-types";
import type {AppLocale} from "@/i18n/routing";
import type {WorkspaceSearchPage, WorkspaceKind} from "@/lib/admin/workspace-search-types";
export type WorkspaceSearchLabels = Readonly<{title:string;description:string;query:string;submit:string;idle:string;empty:string;invalid:string;denied:string;unavailable:string;next:string;first:string;members:string;kinds:Readonly<Record<WorkspaceKind,string>>}>;
export type WorkspaceSearchState = Readonly<{status:"idle"|"invalid"|"denied"|"unavailable"}> | Readonly<{status:"ready";page:WorkspaceSearchPage}>;
export function WorkspaceSearchView({locale,query,cursor,state,labels}: Readonly<{locale:AppLocale;query:string;cursor?:string;state:WorkspaceSearchState;labels:WorkspaceSearchLabels}>) {
  const action=localizedPath(locale,"/admin/search");
  const pageHref=(next?:string)=>action+"?"+new URLSearchParams({q:query,...(next?{cursor:next}:{})});
  return <div className="space-y-8">
    <header className="space-y-3"><h1 className="font-serif text-3xl font-semibold sm:text-4xl">{labels.title}</h1><p className="text-muted-foreground">{labels.description}</p></header>
    <form action={action} method="get" role="search" aria-label={labels.title} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2"><label className="block text-sm font-medium" htmlFor="workspace-query">{labels.query}</label><input id="workspace-query" name="q" type="search" defaultValue={query} maxLength={120} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-primary"/></div>
      <button type="submit" className="inline-flex min-h-11 items-center justify-center self-end rounded-md bg-primary px-4 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{labels.submit}</button>
    </form>
    <Link href={localizedPath(locale,"/admin/members")} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{labels.members}</Link>
    {state.status !== "ready" ? <p role={state.status==='denied'||state.status==='unavailable'?'alert':'status'} className="rounded-md border p-4 text-muted-foreground">{labels[state.status]}</p>
      : state.page.items.length === 0 ? <p role="status" className="rounded-md border p-4 text-muted-foreground">{labels.empty}</p>
      : <div className="space-y-6">{WORKSPACE_KINDS.map(kind=>{
        const items=state.page.items.filter(item=>item.kind===kind);
        return items.length?<section key={kind} aria-labelledby={`workspace-${kind}`} className="space-y-2"><h2 id={`workspace-${kind}`} className="text-lg font-semibold">{labels.kinds[kind]}</h2><ul className="divide-y rounded-md border">{items.map(item=><li key={item.id}><Link className="flex min-h-11 min-w-0 items-center break-words px-4 py-3 text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary" href={localizedPath(locale,item.href)}>{item.label||item.id}</Link></li>)}</ul></section>:null;
      })}</div>}
    {state.status==='ready'&&(cursor||state.page.nextCursor)?<nav aria-label={labels.title} className="flex flex-wrap gap-3">{cursor?<Link className="inline-flex min-h-11 items-center rounded-md border px-4" href={pageHref()}>{labels.first}</Link>:null}{state.page.nextCursor?<Link className="inline-flex min-h-11 items-center rounded-md border px-4" href={pageHref(state.page.nextCursor)}>{labels.next}</Link>:null}</nav>:null}
  </div>;
}
