import {OperationsBaselineForm, type OperationsBaselineLabels} from "@/components/admin/operations-baseline-form";
import {OperationsTimingForm, type OperationsTimingLabels} from "@/components/admin/operations-timing-form";
import {operationsMetricsRepository} from "@/lib/db/repos/operations-metrics";
import {parseReportWindow} from "@/lib/admin/reports";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {z} from "zod";

import {BoardDraftList} from "@/components/admin/board-draft-list";
import {ReportCards, toReportPeriodMessage, type ReportCardLabels} from "@/components/admin/report-cards";
import type {AppLocale} from "@/i18n/routing";
import {listBoardDrafts} from "@/lib/admin/board-drafts";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getAdminReport} from "@/lib/admin/reports";
import type {AdminActor} from "@/lib/membership/lifecycle";



type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;
type AdminReport = Awaited<ReturnType<typeof getAdminReport>>;

function hongKongToday(now = new Date()): {from: string; to: string} {
  const parts = new Intl.DateTimeFormat("en", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  return {from: `${year}-${month}-01`, to: `${year}-${month}-${value("day")}`};
}

async function loadReport(actor: AdminActor, reportQuery: unknown): Promise<{report: AdminReport | null; invalid: boolean}> {
  try {
    return {report: await getAdminReport(actor, reportQuery), invalid: false};
  } catch (error) {
    if (error instanceof z.ZodError) return {report: null, invalid: true};
    throw error;
  }
}

export default async function AdminReportsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, query, actor] = await Promise.all([
    getTranslations({locale, namespace: "Admin.reports"}),
    searchParams,
    requireAdminPageActor(),
  ]);
  const defaults = hongKongToday();
  const reportQuery = Object.keys(query).length === 0 ? defaults : query;
  const [{report, invalid}, boardDrafts] = await Promise.all([
    loadReport(actor, reportQuery),
    listBoardDrafts(actor),
  ]);
  const timing = await getTranslations({locale, namespace: "OperationsTiming"});
  const timingLabels = Object.fromEntries((["heading", "description", "formLabel", "caseId", "caseKind", "auditId", "runId", "comparisonId", "startedAt", "endedAt", "humanMinutes", "reviewMinutes", "reworkMinutes", "waitMinutes", "cohort", "baseline", "assisted", "decision", "adopted", "edited", "rejected", "manual", "reopened", "submit", "pending", "newObservation", "saved", "invalid", "unavailable", "forbidden", "application", "support", "renewal", "board", "content", "membership", "event", "cms"] as const).map(key => [key, timing(key)])) as OperationsTimingLabels;
  const baselineLabels = Object.fromEntries((["freezeHeading", "freezeDescription", "comparisonId", "baselineFrom", "baselineTo", "freezeSubmit", "freezeSaved", "pending", "invalid", "unavailable", "forbidden"] as const).map(key => [key, timing(key)])) as OperationsBaselineLabels;
  const impact = report ? await operationsMetricsRepository.read(actor, parseReportWindow(reportQuery).utc).catch(() => null) : null;
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits: 2});
  const from = typeof reportQuery.from === "string" ? reportQuery.from : "";
  const to = typeof reportQuery.to === "string" ? reportQuery.to : "";
  const boardDraftLabels = {
    heading: t("boardDraftsHeading"), description: t("boardDraftsDescription"), empty: t("boardDraftsEmpty"),
    preview: t("boardDraftPreview"), reportMonth: t("boardDraftReportMonth"), createdAt: t("boardDraftCreatedAt"),
    agentRunStatus: t("boardDraftAgentRunStatus"), unavailable: t("unavailable"),
    statuses: {
      running: t("boardDraftStatuses.running"),
      disabled: t("boardDraftStatuses.disabled"),
      completed: t("boardDraftStatuses.completed"),
      failed: t("boardDraftStatuses.failed"),
      escalated: t("boardDraftStatuses.escalated"),
    },
  };
  const labels: ReportCardLabels = {
    cardsLabel: t("cardsLabel"), period: toReportPeriodMessage(t.raw("period")), arr: t("arr"), arrDescription: t("arrDescription"), mrr: t("mrr"), mrrDescription: t("mrrDescription"),
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
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="operations-timing-heading">
      <h2 id="operations-timing-heading" className="font-serif text-2xl font-semibold">{timing("heading")}</h2>
      <p>{timing(impact?.status === "measured" ? "measuredStatus" : "status")}</p>
      <p className="text-sm text-muted-foreground">{timing("scope")}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt>{timing("period")}</dt><dd>{from} – {to}</dd></div>
        <div><dt>{timing("cases")}</dt><dd>{impact?.caseCount == null ? timing("unknown") : number.format(impact.caseCount)}</dd></div>
        <div><dt>{timing("samples")}</dt><dd>{impact?.sampleCount == null ? timing("unknown") : number.format(impact.sampleCount)}</dd></div>
        <div><dt>{timing("missing")}</dt><dd>{impact?.missingRate == null ? timing("unknown") : new Intl.NumberFormat(locale, {style: "percent", maximumFractionDigits: 1}).format(impact.missingRate)}</dd></div>
        <div><dt>{timing("net")}</dt><dd>{impact?.netMinutes == null ? timing("unknown") : number.format(impact.netMinutes)}</dd></div>
        <div><dt>{timing("comparisonSamples")}</dt><dd>{impact?.comparisonSampleCount == null ? timing("unknown") : number.format(impact.comparisonSampleCount)}</dd></div>
        <div><dt>{timing("comparisonMissing")}</dt><dd>{impact?.comparisonMissingRate == null ? timing("unknown") : new Intl.NumberFormat(locale, {style: "percent", maximumFractionDigits: 1}).format(impact.comparisonMissingRate)}</dd></div>
      </dl>
      {impact?.baselinePeriods.map(period => <p key={period.comparisonId} className="break-all text-sm">{timing("frozenPeriod")}: {period.comparisonId} · {period.from} – {period.toExclusive}</p>)}
      <OperationsTimingForm labels={timingLabels}/>
      <OperationsBaselineForm labels={baselineLabels}/>
    </section>
    <BoardDraftList drafts={boardDrafts} labels={boardDraftLabels} locale={locale}/>
  </div>;
}
