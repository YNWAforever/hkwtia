import {getTranslations, setRequestLocale} from "next-intl/server";

import {LeadReport, type LeadReportLabels} from "@/components/admin/lead-report";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {CONTACT_SOURCES, CONTACT_STAGES} from "@/lib/db/repos/contacts";
import {leadReportRepository, parseLeadReportWindow} from "@/lib/db/repos/lead-report";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const WINDOWS = ["30", "90", "180", "all"] as const;

export default async function AdminLeadReportPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, query, actor] = await Promise.all([
    getTranslations({locale, namespace: "Admin.reports.leads"}),
    searchParams,
    requireAdminPageActor(),
  ]);
  // Untrusted URL input: anything but one known value is the default, so a
  // mistyped link renders the 90-day report instead of an error.
  const window = parseLeadReportWindow(query.window);
  // A staff report must not pretend the pipeline is empty when the read failed:
  // "no leads" and "we could not ask" lead to opposite decisions.
  const report = await leadReportRepository.summary(actor, window).catch(() => null);

  const labels: LeadReportLabels = {
    funnelHeading: t("funnelHeading"), funnelCaption: t("funnelCaption"), sourceColumn: t("sourceColumn"),
    totalColumn: t("totalColumn"), memberRate: t("memberRate"), emptyFunnel: t("emptyFunnel"),
    stage: Object.fromEntries(CONTACT_STAGES.map((stage) => [stage, t(`stage.${stage}`)])) as LeadReportLabels["stage"],
    source: Object.fromEntries(CONTACT_SOURCES.map((source) => [source, t(`source.${source}`)])) as LeadReportLabels["source"],
    ownersHeading: t("ownersHeading"), ownersCaption: t("ownersCaption"), ownerColumn: t("ownerColumn"),
    unassigned: t("unassigned"), invitesSentColumn: t("invitesSentColumn"), invitesOpenedColumn: t("invitesOpenedColumn"),
    applicationsColumn: t("applicationsColumn"), membersColumn: t("membersColumn"), emptyOwners: t("emptyOwners"),
    invitesHeading: t("invitesHeading"), sent: t("sent"), opened: t("opened"), applied: t("applied"), paid: t("paid"), joinedFree: t("joinedFree"),
    ofSent: (percent) => t("ofSent", {percent}),
    median: t("median"), medianValue: (hours) => t("medianValue", {hours}), noMedian: t("noMedian"),
    invitedVsJoinedHeading: t("invitedVsJoinedHeading"), invitedColumn: t("invitedColumn"),
    joinedColumn: t("joinedColumn"), countColumn: t("countColumn"), emptyPlans: t("emptyPlans"),
    plan: Object.fromEntries(MEMBERSHIP_PLAN_CODES.map((code) => [code, t(`plan.${code}`)])) as LeadReportLabels["plan"],
    estimateHeading: t("estimateHeading"), estimateLabel: t("estimateLabel"), estimateNote: t("estimateNote"),
  };

  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        {/* The i18n Link takes an UNPREFIXED path and adds the locale itself (round-28 rule). */}
        <Link className="inline-flex min-h-11 items-center text-primary underline" href="/admin/reports" prefetch={false}>{t("back")}</Link>
      </header>
      <nav aria-label={t("windowLabel")} className="flex flex-wrap gap-2">
        {WINDOWS.map((option) => (
          <Link
            aria-current={option === window ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-4 py-2 text-sm font-medium ${option === window ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
            href={`/admin/reports/leads?window=${option}`}
            key={option}
            prefetch={false}
          >
            {t(`window.${option}`)}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{t("windowNote")}</p>
      {report === null
        ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("unavailable")}</p>
        : <LeadReport labels={labels} locale={locale} report={report}/>}
    </div>
  );
}
