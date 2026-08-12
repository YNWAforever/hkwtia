import {getTranslations, setRequestLocale} from "next-intl/server";

import {DashboardTiles, type DashboardTile} from "@/components/admin/dashboard-tiles";
import type {AppLocale} from "@/i18n/routing";
import {listPendingApprovals} from "@/lib/admin/approvals";
import {listAtRiskMembers} from "@/lib/admin/at-risk";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {adminPostsRepository} from "@/lib/db/repos/admin-posts";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import type {AdminActor} from "@/lib/membership/lifecycle";

type Props = Readonly<{params: Promise<{locale: string}>}>;

/**
 * Each queue is counted independently and degrades on its own. One unreachable
 * table should cost staff that tile, not the whole workspace: the dashboard is
 * the page they land on, so failing it closed would read as "the admin panel is
 * down" when three of four queues are fine.
 */
async function count<T>(read: Promise<readonly T[]>): Promise<number | null> {
  try {
    return (await read).length;
  } catch {
    return null;
  }
}

async function queueCounts(actor: AdminActor) {
  const [approvals, atRisk, listings, draftNews] = await Promise.all([
    count(listPendingApprovals(actor)),
    count(listAtRiskMembers(actor, {asOf: new Date()})),
    count(showcaseRepository.listForReview(actor)),
    (async () => {
      try {
        const posts = await adminPostsRepository.listForAdmin(actor);
        return posts.filter((post) => post.publishedAt === null).length;
      } catch {
        return null;
      }
    })(),
  ]);
  return {approvals, atRisk, listings, draftNews};
}

export default async function AdminPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout already guards this route. Repeating the check here keeps the
  // rule uniform across every admin page, so the boundary test can discover
  // routes instead of relying on a hand-maintained list that fails open.
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin"});
  const counts = await queueCounts(actor);

  const tiles: readonly DashboardTile[] = [
    {id: "approvals", href: "/admin/approvals", label: t("dashboard.pendingApprovals"), count: counts.approvals},
    {id: "at-risk", href: "/admin/at-risk", label: t("dashboard.atRisk"), count: counts.atRisk},
    {id: "listings", href: "/admin/listings-review", label: t("dashboard.listingsAwaitingReview"), count: counts.listings},
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
    </div>
  );
}
