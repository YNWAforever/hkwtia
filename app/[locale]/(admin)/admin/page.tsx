import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {notFound} from "next/navigation";
import {WorkQueueTable} from "@/components/admin/work-queue-table";
import {WORK_ACTIONS,WORK_KINDS,listMyWork,workQueueQuerySchema} from "@/lib/admin/work-queue";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {DashboardTiles, type DashboardTile} from "@/components/admin/dashboard-tiles";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {adminBatchHistoryRepository} from "@/lib/db/repos/admin-batch-history";
import {adminDashboardRepository} from "@/lib/db/repos/admin-dashboard";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>;searchParams?:Promise<Record<string,string|string[]|undefined>>}>;

export default async function AdminPage({params,searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout already guards this route. Repeating the check here keeps the
  // rule uniform across every admin page, so the boundary test can discover
  // routes instead of relying on a hand-maintained list that fails open.
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin"});
  const snapshotAt = new Date();
  const hongKongDateTime = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  const raw=searchParams?await searchParams:{};
  const parsed=workQueueQuerySchema.safeParse({scope:raw.workScope??"mine",cursor:raw.workCursor??null});
  if(!parsed.success)notFound();
  const query=parsed.data;
  const [counts, recentBatches, work] = await Promise.all([
    adminDashboardRepository.counts(actor, snapshotAt),
    adminBatchHistoryRepository.recent(actor).catch(() => null),
    listMyWork(actor,query,snapshotAt).catch(()=>null),
  ]);

  const tiles: readonly DashboardTile[] = [
    {id:"unfinished-applications",href:"/admin/members/queue?status=draft",label:t("dashboard.unfinishedApplications"),count:counts.unfinishedApplications},
    {id:"submitted-applications",href:"/admin/members/queue",label:t("dashboard.submittedApplications"),count:counts.submittedApplications},
    {id: "profiles-review", href: "/admin/profiles-review", label: t("dashboard.profilesAwaitingReview"), count: counts.profiles},
    {id: "listings", href: "/admin/listings-review?status=pending_review", label: t("dashboard.listingsAwaitingReview"), count: counts.listings},
    {id: "approvals", href: "/admin/approvals", label: t("dashboard.pendingApprovals"), count: counts.approvals},
    {id: "tasks", href: "/admin/tasks", label: t("dashboard.openTasks"), count: counts.openTasks},
    {id: "at-risk", href: "/admin/at-risk", label: t("dashboard.atRisk"), count: counts.atRisk},
    {id: "news", href: "/admin/news", label: t("dashboard.draftNews"), count: counts.draftNews},
  ];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("brand")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("description")}</p>
        <p className="text-sm text-muted-foreground"><time dateTime={snapshotAt.toISOString()}>{t("dashboard.snapshotAt", {time: hongKongDateTime.format(snapshotAt)})}</time></p>
      </header>
      <WorkQueueTable locale={locale} scope={query.scope} cursor={query.cursor} page={work} labels={{
       title:t("workQueue.title"),description:t("workQueue.description"),mine:t("workQueue.mine"),unassigned:t("workQueue.unassigned"),all:t("workQueue.all"),empty:t("workQueue.empty"),emptyMine:t("workQueue.emptyMine"),unavailable:t("workQueue.unavailable"),summary:t("workQueue.summary"),owner:t("workQueue.owner"),due:t("workQueue.due"),nextAction:t("workQueue.nextAction"),overdue:t("workQueue.overdue"),assigned:t("workQueue.assigned"),noDue:t("workQueue.noDue"),next:t("workQueue.next"),first:t("workQueue.first"),
       kinds:Object.fromEntries(WORK_KINDS.map(kind=>[kind,t(`workQueue.kinds.${kind}`)])) as Record<typeof WORK_KINDS[number],string>,
       actions:Object.fromEntries(WORK_ACTIONS.map(action=>[action,t(`workQueue.actions.${action}`)])) as Record<typeof WORK_ACTIONS[number],string>,
       states:Object.fromEntries(["draft","pending_review","pending_payment","active","past_due","human","open"].map(status=>[status,t(`workQueue.states.${status}`)])),
      }}/>
      <section aria-label={t("dashboard.denominators")} className="space-y-3"><p className="text-sm text-muted-foreground">{t("dashboard.denominatorHelp")}</p><dl className="grid gap-3 sm:grid-cols-3">{(["profileRecords","activeMemberships","companySeats"] as const).map(key=><div className="rounded-md border bg-card p-4" key={key}><dt className="text-sm text-muted-foreground">{t(`dashboard.${key}`)}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{counts[key]??t("dashboard.unavailable")}</dd></div>)}</dl></section>
      <DashboardTiles
        locale={locale}
        tiles={tiles}
        labels={{
          heading: t("dashboard.heading"),
          description: t("dashboard.description"),
          view: t("dashboard.view"),
          unavailable: t("dashboard.unavailable"),
          applicationQueue: t("dashboard.applicationQueue"),
        }}
      />
      <section aria-labelledby="admin-recent-batches" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold" id="admin-recent-batches">{t("batches.history.recentTitle")}</h2><Link prefetch={false} className="text-primary underline" href={localizedPath(locale, "/admin/batches")}>{t("batches.history.viewAll")}</Link></div>
        {recentBatches === null ? <p className="text-muted-foreground" role="status">{t("batches.history.recentUnavailable")}</p>
          : recentBatches.length === 0 ? <p className="text-muted-foreground">{t("batches.history.recentEmpty")}</p>
          : <ul className="grid gap-3">
            {recentBatches.map(item => <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4" key={item.id}>
              <div className="space-y-1">
                <p className="font-medium">{t(`batches.history.operations.${item.operation}`)}</p>
                <p className="text-sm text-muted-foreground">{t(`batches.states.${item.state}`)} · {item.succeeded} / {item.total} · {t("batches.history.recentFailed", {count: item.failed})}</p>
                <p className="text-xs text-muted-foreground"><time dateTime={item.createdAt}>{hongKongDateTime.format(new Date(item.createdAt))}</time></p>
              </div>
              <Link prefetch={false} className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, `/admin/batches/${item.id}`)}>{t("batches.history.open")}</Link>
            </li>)}
          </ul>}
      </section>
    </div>
  );
}
