import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {DashboardTiles, type DashboardTile} from "@/components/admin/dashboard-tiles";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {adminBatchHistoryRepository} from "@/lib/db/repos/admin-batch-history";
import {adminDashboardRepository} from "@/lib/db/repos/admin-dashboard";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout already guards this route. Repeating the check here keeps the
  // rule uniform across every admin page, so the boundary test can discover
  // routes instead of relying on a hand-maintained list that fails open.
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin"});
  const [counts, recentBatches] = await Promise.all([
    adminDashboardRepository.counts(actor),
    adminBatchHistoryRepository.recent(actor).catch(() => null),
  ]);

  const tiles: readonly DashboardTile[] = [
    {id: "approvals", href: "/admin/approvals", label: t("dashboard.pendingApprovals"), count: counts.approvals},
    {id: "at-risk", href: "/admin/at-risk", label: t("dashboard.atRisk"), count: counts.atRisk},
    {id: "listings", href: "/admin/listings-review?status=pending_review", label: t("dashboard.listingsAwaitingReview"), count: counts.listings},
    {id: "profiles-review", href: "/admin/profiles-review", label: t("dashboard.profilesAwaitingReview"), count: counts.profiles},
    {id: "tasks", href: "/admin/tasks", label: t("dashboard.openTasks"), count: counts.openTasks},
    {id: "news", href: "/admin/news", label: t("dashboard.draftNews"), count: counts.draftNews},
  ];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("brand")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("description")}</p>
      </header>
      <DashboardTiles
        locale={locale}
        tiles={tiles}
        labels={{
          heading: t("dashboard.heading"),
          description: t("dashboard.description"),
          view: t("dashboard.view"),
          unavailable: t("dashboard.unavailable"),
        }}
      />
      <section aria-labelledby="admin-recent-batches" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold" id="admin-recent-batches">{t("batches.history.recentTitle")}</h2><Link className="text-primary underline" href={localizedPath(locale, "/admin/batches")}>{t("batches.history.viewAll")}</Link></div>
        {recentBatches === null ? <p className="text-muted-foreground" role="status">{t("batches.history.recentUnavailable")}</p>
          : recentBatches.length === 0 ? <p className="text-muted-foreground">{t("batches.history.recentEmpty")}</p>
          : <ul className="grid gap-3">{recentBatches.map(item => <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4" key={item.id}><div><p className="font-medium">{t(`batches.history.operations.${item.operation}`)}</p><p className="text-sm text-muted-foreground">{t(`batches.states.${item.state}`)} · {item.succeeded} / {item.total}</p></div><Link className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, `/admin/batches/${item.id}`)}>{t("batches.history.open")}</Link></li>)}</ul>}
      </section>
    </div>
  );
}
