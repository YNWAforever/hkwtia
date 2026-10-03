import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {batchHistoryOperations, parseBatchHistoryRouteQuery} from "@/lib/admin/batches/history";
import {BATCH_STATES} from "@/lib/admin/batches/types";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {adminBatchHistoryRepository} from "@/lib/db/repos/admin-batch-history";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;
export default async function AdminBatchesPage({params, searchParams}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  let query;
  try {query = parseBatchHistoryRouteQuery(await searchParams);}
  catch {notFound();}
  const t = await getTranslations({locale, namespace: "Admin.batches"});
  const href = localizedPath(locale, "/admin/batches");
  const formHref = (cursor?: string) => {
    const params = new URLSearchParams();
    if (query.state) params.set("state", query.state);
    if (query.operation) params.set("operation", query.operation);
    if (cursor) params.set("cursor", cursor);
    return `${href}${params.size ? `?${params}` : ""}`;
  };
  let page;
  try {page = await adminBatchHistoryRepository.list(actor, query);}
  catch (error) {if (isAuthorizationDenial(error)) throw error; page = null;}
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <div className="space-y-6">
    <header className="space-y-2"><h1 className="font-serif text-4xl font-semibold tracking-tight">{t("history.title")}</h1><p className="text-muted-foreground">{t("history.description")}</p></header>
    {process.env.ADMIN_BATCH_ENABLED !== "true" ? <p className="rounded-md border bg-muted/40 p-4 text-sm" role="status">{t("history.disabled")}</p> : null}
    <form action={href} className="flex flex-wrap items-end gap-3" method="get">
      <label className="grid gap-1 text-sm">{t("history.stateFilter")}<select className="min-h-11 rounded-md border bg-background px-3" defaultValue={query.state ?? ""} name="state"><option value="">{t("history.allStates")}</option>{BATCH_STATES.map(state => <option key={state} value={state}>{t(`states.${state}`)}</option>)}</select></label>
      <label className="grid gap-1 text-sm">{t("history.operationFilter")}<select className="min-h-11 rounded-md border bg-background px-3" defaultValue={query.operation ?? ""} name="operation"><option value="">{t("history.allOperations")}</option>{batchHistoryOperations.map(operation => <option key={operation} value={operation}>{t(`history.operations.${operation}`)}</option>)}</select></label>
      <button className="min-h-11 rounded-md border px-4 text-sm font-medium" type="submit">{t("history.apply")}</button>
    </form>
    {page === null ? <div className="rounded-md border p-5" role="alert"><p>{t("history.unavailable")}</p><Link className="mt-3 inline-flex min-h-11 items-center text-primary underline" href={formHref()}>{t("history.retry")}</Link></div>
      : page.items.length === 0 ? <p className="rounded-md border p-5 text-muted-foreground">{t("history.empty")}</p>
      : <div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm"><caption className="caption-top p-4 text-left font-medium">{t("history.tableCaption")}</caption><thead className="bg-muted/40"><tr><th className="px-4 py-3" scope="col">{t("history.created")}</th><th className="px-4 py-3" scope="col">{t("history.operation")}</th><th className="px-4 py-3" scope="col">{t("history.state")}</th><th className="px-4 py-3" scope="col">{t("history.actor")}</th><th className="px-4 py-3" scope="col">{t("history.progress")}</th><th className="px-4 py-3" scope="col">{t("history.details")}</th></tr></thead><tbody>{page.items.map(item => <tr className="border-t" key={item.id}><td className="px-4 py-3"><time dateTime={item.createdAt}>{formatter.format(new Date(item.createdAt))}</time></td><td className="px-4 py-3">{t(`history.operations.${item.operation}`)}</td><td className="px-4 py-3">{t(`states.${item.state}`)}</td><td className="px-4 py-3">{item.actorLabel}</td><td className="px-4 py-3">{item.succeeded} / {item.total}{item.failed > 0 ? ` · ${item.failed} ${t("counters.failed")}` : null}</td><td className="px-4 py-3"><Link className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, `/admin/batches/${item.id}`)}>{t("history.open")}</Link></td></tr>)}</tbody></table></div>}
    {page?.nextCursor ? <nav aria-label={t("history.pagination")}><Link className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm" href={formHref(page.nextCursor)}>{t("history.next")}</Link></nav> : null}
  </div>;
}
