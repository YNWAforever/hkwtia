import type {AppLocale} from "@/i18n/routing";
import type {AdminReport, ReconciledMetric} from "@/lib/admin/report-formulas";

export type ReportCardLabels = Readonly<{
  cardsLabel: string; period: string; arr: string; arrDescription: string; mrr: string; mrrDescription: string;
  renewal: string; renewalDescription: string; firstYearRenewal: string; firstYearRenewalDescription: string;
  funnel: string; funnelDescription: string; started: string; profileCompleted: string; checkoutOrReview: string; activated: string;
  attendance: string; attendanceDescription: string; atRisk: string; atRiskDescription: string;
  numerator: string; denominator: string; unavailable: string;
}>;

type CardProps = Readonly<{id: string; title: string; description: string; value?: string; period: string; children?: React.ReactNode}>;

function ReportCard({id, title, description, value, period, children}: CardProps) {
  return <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <h2 className="font-serif text-xl font-semibold" id={id}>{title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    {value ? <p className="mt-5 text-3xl font-semibold tabular-nums">{value}</p> : null}
    {children}
    <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">{period}</p>
  </section>;
}

function Reconciliation({labels, metric}: {labels: ReportCardLabels; metric: ReconciledMetric}) {
  return <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
    <div><dt className="text-muted-foreground">{labels.numerator}</dt><dd className="mt-1 font-medium tabular-nums">{metric.numerator}</dd></div>
    <div><dt className="text-muted-foreground">{labels.denominator}</dt><dd className="mt-1 font-medium tabular-nums">{metric.denominator}</dd></div>
  </dl>;
}

export function ReportCards({locale, labels, report}: {locale: AppLocale; labels: ReportCardLabels; report: AdminReport}) {
  const language = locale === "zh-HK" ? "zh-HK" : "en-HK";
  const dateFormatter = new Intl.DateTimeFormat(language, {year: "numeric", month: "short", day: "numeric", timeZone: report.window.timezone});
  const currencyFormatter = new Intl.NumberFormat(language, {style: "currency", currency: "HKD", maximumFractionDigits: 0});
  const period = labels.period.replace("{from}", dateFormatter.format(new Date(`${report.window.from}T00:00:00+08:00`)))
    .replace("{to}", dateFormatter.format(new Date(`${report.window.to}T00:00:00+08:00`))).replace("{timezone}", report.window.timezone);
  const percentage = (metric: ReconciledMetric) => metric.percentage === null ? labels.unavailable : `${metric.percentage.toFixed(1).replace(".0", "")}%`;
  const reconciled = (id: string, title: string, description: string, metric: ReconciledMetric) => <ReportCard description={description} id={id} period={period} title={title} value={percentage(metric)}><Reconciliation labels={labels} metric={metric}/></ReportCard>;

  return <div aria-label={labels.cardsLabel} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="region">
    <ReportCard description={labels.arrDescription} id="report-arr" period={period} title={labels.arr} value={currencyFormatter.format(report.revenue.arrHkd)}/>
    <ReportCard description={labels.mrrDescription} id="report-mrr" period={period} title={labels.mrr} value={currencyFormatter.format(report.revenue.mrrHkd)}/>
    {reconciled("report-renewal", labels.renewal, labels.renewalDescription, report.renewal)}
    {reconciled("report-first-year-renewal", labels.firstYearRenewal, labels.firstYearRenewalDescription, report.firstYearRenewal)}
    <ReportCard description={labels.funnelDescription} id="report-funnel" period={period} title={labels.funnel}>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {([[labels.started, report.funnel.started], [labels.profileCompleted, report.funnel.profileCompleted], [labels.checkoutOrReview, report.funnel.checkoutOrReview], [labels.activated, report.funnel.activated]] as const).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}
      </dl>
    </ReportCard>
    {reconciled("report-attendance", labels.attendance, labels.attendanceDescription, report.attendance)}
    <ReportCard description={labels.atRiskDescription} id="report-at-risk" period={period} title={labels.atRisk} value={String(report.atRiskCount)}/>
  </div>;
}
