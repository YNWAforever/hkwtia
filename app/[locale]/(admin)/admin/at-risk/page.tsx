import {getTranslations, setRequestLocale} from "next-intl/server";

import {AtRiskTable} from "@/components/admin/at-risk-table";
import type {AppLocale} from "@/i18n/routing";
import {listAtRiskMembers} from "@/lib/admin/at-risk";
import {requireAdminPageActor} from "@/lib/admin/page-auth";


type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminAtRiskPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.atRisk"});
  let members;
  try {
    members = await listAtRiskMembers(actor, {asOf: new Date()});
  } catch {
    return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header><p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header><AtRiskTable locale={locale} members={members} labels={{caption: t("caption"), empty: t("empty"), name: t("name"), company: t("company"), tier: t("tier"), status: t("status"), score: t("score"), trend: t("trend"), renewal: t("renewal"), evidence: t("evidence"), actions: t("actions"), unavailable: t("unavailable"), branchAEvidence: t("branchAEvidence"), branchBEvidence: t("branchBEvidence"), member360: t("member360"), addNote: t("addNote"), campaign: t("campaign"), plans: {community: t("plans.community"), startup: t("plans.startup"), corporate: t("plans.corporate"), patron: t("plans.patron")}, statuses: {active: t("statuses.active"), past_due: t("statuses.pastDue")}}} /></div>;
}
