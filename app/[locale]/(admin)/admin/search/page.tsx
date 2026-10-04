import {getTranslations, setRequestLocale} from "next-intl/server";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {searchWorkspace, workspaceSearchInputSchema, WORKSPACE_KINDS} from "@/lib/admin/workspace-search";
import {WorkspaceSearchView, type WorkspaceSearchState} from "@/components/admin/workspace-search-view";

type Props=Readonly<{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}>;
export default async function AdminWorkspaceSearchPage({params,searchParams}:Props) {
  const {locale:localeValue}=await params; const locale=localeValue as AppLocale;
  setRequestLocale(locale);
  const actor=await requireAdminPageActor("/admin/search");
  const t=await getTranslations({locale,namespace:"WorkspaceSearch"});
  const raw=await searchParams;
  const parsed=workspaceSearchInputSchema.safeParse({query:raw.q??"",cursor:raw.cursor,limit:20});
  let state:WorkspaceSearchState={status:"idle"};
  if(!parsed.success) state={status:"invalid"};
  else if(parsed.data.query) {
    try {state={status:"ready",page:await searchWorkspace(actor,parsed.data)};}
    catch(error) {state={status:isAuthorizationDenial(error)?"denied":error instanceof Error&&error.message==='INVALID_CURSOR'?"invalid":"unavailable"};}
  }
  return <WorkspaceSearchView locale={locale} query={parsed.success?parsed.data.query:""} cursor={parsed.success?parsed.data.cursor:undefined} state={state} labels={{title:t("title"),description:t("description"),query:t("query"),submit:t("submit"),idle:t("idle"),empty:t("empty"),invalid:t("invalid"),denied:t("denied"),unavailable:t("unavailable"),next:t("next"),first:t("first"),members:t("members"),kinds:Object.fromEntries(WORKSPACE_KINDS.map(kind=>[kind,t(`kinds.${kind}`)])) as Record<typeof WORKSPACE_KINDS[number],string>}}/>;
}
