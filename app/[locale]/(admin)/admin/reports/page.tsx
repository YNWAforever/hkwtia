import {getTranslations, setRequestLocale} from "next-intl/server";

import {z} from "zod";

import {ReportCards, type ReportCardLabels} from "@/components/admin/report-cards";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getAdminReport} from "@/lib/admin/reports";



type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function hongKongToday(now = new Date()): {from: string; to: string} {
  const parts = new Intl.DateTimeFormat("en", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  return {from: `${year}-${month}-01`, to: `${year}-${month}-${value("day")}`};
}

export default async function AdminReportsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Admin.reports"});
  const query = await searchParams;
  const defaults = hongKongToday();
  const reportQuery = Object.keys(query).length === 0 ? defaults : query;
  let report = null;
  let invalid = false;
  try { report = await getAdminReport(await requireAdminPageActor(), reportQuery); }
  catch (error) {

    if (error instanceof z.ZodError) invalid = true; else throw error;
  }
  const from = typeof reportQuery.from === "string" ? reportQuery.from : "";
  const to = typeof reportQuery.to === "string" ? reportQuery.to : "";
  const labels: ReportCardLabels = {
    cardsLabel: t("cardsLabel"), period: t("period"), arr: t("arr"), arrDescription: t("arrDescription"), mrr: t("mrr"), mrrDescription: t("mrrDescription"),
    renewal: t("renewal"), renewalDescription: t("renewalDescription"), firstYearRenewal: t("firstYearRenewal"), firstYearRenewalDescription: t("firstYearRenewalDescription"),
    funnel: t("funnel"), funnelDescription: t("funnelDescription"), started: t("started"), profileCompleted: t("profileCompleted"), checkoutOrReview: t("checkoutOrReview"), activated: t("activated"),
    attendance: t("attendance"), attendanceDescription: t("attendanceDescription"), atRisk: t("atRisk"), atRiskDescription: t("atRiskDescription"),
    numerator: t("numerator"), denominator: t("denominator"), unavailable: t("unavailable"),
  };

  return <div className="space-y-8">
    <header className="max-w-3xl space-y-3"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header>
    <form aria-label={t("formLabel")} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
      <label className="grid gap-2 text-sm font-medium">{t("from")}<input className="rounded-md border border-input bg-background px-3 py-2" defaultValue={from} name="from" required type="date"/></label>
      <label className="grid gap-2 text-sm font-medium">{t("to")}<input className="rounded-md border border-input bg-background px-3 py-2" defaultValue={to} name="to" required type="date"/></label>
      <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" type="submit">{t("apply")}</button>
      {invalid ? <p aria-live="polite" className="text-sm text-destructive sm:col-span-3" role="alert">{t("validation")}</p> : null}
    </form>
    {report ? <ReportCards labels={labels} locale={locale} report={report}/> : null}
  </div>;
}
