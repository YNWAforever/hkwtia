import {getTranslations, setRequestLocale} from "next-intl/server";
import Link from "next/link";

import {MemberTable} from "@/components/admin/member-table";
import {MemberSavedViews} from "@/components/admin/member-saved-views";
import {listMemberViews} from "@/lib/admin/member-views";
import {adminMemberViewsRepository} from "@/lib/db/repos/admin-member-views";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {parseAdminMemberHistory, parseAdminMemberRouteQuery} from "@/lib/admin/member-types";
import {searchAdminMembers} from "@/lib/admin/members";


type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function AdminMembersPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rawQuery = await searchParams;
  const query = parseAdminMemberRouteQuery(rawQuery);
  const history = parseAdminMemberHistory(rawQuery.history);
  const page = await searchAdminMembers(actor, query);
  const savedViews = await listMemberViews(actor, adminMemberViewsRepository);
  const t = await getTranslations({locale, namespace: "Admin"});
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("navigation.members")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("members.title")}</h1><p className="text-lg text-muted-foreground">{t("members.description")}</p></header>{process.env.ADMIN_BATCH_ENABLED === "true" && process.env.MEMBER_IMPORT_ENABLED === "true" ? <Link className="inline-flex min-h-11 items-center rounded-md border px-4 text-primary underline" href={locale === "zh-HK" ? "/zh/admin/members/import" : "/admin/members/import"}>{t("members.importLink")}</Link> : null}<MemberSavedViews locale={locale} query={query} views={savedViews} canShare={actor.kind === "superadmin"} labels={{title: t("members.savedViews.title"), name: t("members.savedViews.name"), save: t("members.savedViews.save"), saved: t("members.savedViews.saved"), invalid: t("members.savedViews.invalid"), error: t("members.savedViews.error"), shared: t("members.savedViews.shared"), empty: t("members.savedViews.empty")}}/><MemberTable locale={locale} labels={{search: t("members.search"), caption: t("members.caption"), empty: t("members.empty"), name: t("members.name"), email: t("members.email"), company: t("members.company"), plan: t("members.plan"), status: t("members.status"), renewal: t("members.renewal"), score: t("members.score"), next: t("members.next"), previous: t("members.previous"), view: t("members.view"), unavailable: t("members.unavailable"), batch: process.env.ADMIN_BATCH_ENABLED === "true" ? {preview: t("members.batch.preview"), reason: t("members.batch.reason"), language: t("members.batch.language"), english: t("members.batch.english"), chinese: t("members.batch.chinese"), error: t("members.batch.error"), export: process.env.MEMBER_EXPORT_ENABLED === "true" ? {preview: t("members.batch.exportPreview"), fields: t("members.batch.exportFields"), error: t("members.batch.exportError")} : undefined} : undefined, selection: {page: t("members.selection.page"), all: t("members.selection.all"), clear: t("members.selection.clear"), selected: t("members.selection.selected"), row: t("members.selection.row")}, filters: {status: t("members.filters.status"), plan: t("members.filters.plan"), renewalFrom: t("members.filters.renewalFrom"), renewalTo: t("members.filters.renewalTo"), companyId: t("members.filters.companyId"), locale: t("members.filters.locale"), completeness: t("members.filters.completeness"), sort: t("members.filters.sort"), apply: t("members.filters.apply"), clear: t("members.filters.clear"), any: t("members.filters.any"), complete: t("members.filters.complete"), incomplete: t("members.filters.incomplete"), nameAsc: t("members.filters.nameAsc"), nameDesc: t("members.filters.nameDesc"), renewalAsc: t("members.filters.renewalAsc"), english: t("members.filters.english"), chinese: t("members.filters.chinese"), viewsLabel: t("members.filters.viewsLabel"), views: {active: t("members.filters.views.active"), due30: t("members.filters.views.due30"), due60: t("members.filters.views.due60"), due90: t("members.filters.views.due90"), pastDue: t("members.filters.views.pastDue"), expired: t("members.filters.views.expired"), missingData: t("members.filters.views.missingData")}}, planCodes: Object.fromEntries(["community", "startup", "corporate", "patron"].map((code) => [code, t(`members.planCodes.${code}`)])), statusCodes: Object.fromEntries(["active", "past_due", "cancel_at_period_end", "pending_review", "pending_payment", "cancelled", "expired"].map((code) => [code, t(`members.statusCodes.${code}`)]))}} page={page} query={query.search} filters={query} cursor={query.cursor} history={history} limit={query.limit} /></div>;
}
