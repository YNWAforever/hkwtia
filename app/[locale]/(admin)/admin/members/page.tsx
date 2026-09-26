import {getTranslations, setRequestLocale} from "next-intl/server";

import {MemberTable} from "@/components/admin/member-table";
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
  const t = await getTranslations({locale, namespace: "Admin"});
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("navigation.members")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("members.title")}</h1><p className="text-lg text-muted-foreground">{t("members.description")}</p></header><MemberTable locale={locale} labels={{search: t("members.search"), caption: t("members.caption"), empty: t("members.empty"), name: t("members.name"), email: t("members.email"), company: t("members.company"), plan: t("members.plan"), status: t("members.status"), renewal: t("members.renewal"), score: t("members.score"), next: t("members.next"), previous: t("members.previous"), view: t("members.view"), unavailable: t("members.unavailable"), planCodes: Object.fromEntries(["community", "startup", "corporate", "patron"].map((code) => [code, t(`members.planCodes.${code}`)])), statusCodes: Object.fromEntries(["active", "past_due", "cancel_at_period_end", "pending_review", "pending_payment", "cancelled", "expired"].map((code) => [code, t(`members.statusCodes.${code}`)]))}} page={page} query={query.search} cursor={query.cursor} history={history} limit={query.limit} /></div>;
}
