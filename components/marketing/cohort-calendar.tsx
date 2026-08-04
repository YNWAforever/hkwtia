import type {FundingLocale} from "@/config/funding-schemes";
import type {PublicCohort} from "@/lib/launchpad/contracts";

export type CohortCalendarLabels = Readonly<{
  title: string;
  empty: string;
  starts: string;
  ends: string;
  noEnd: string;
  capacity: string;
  fee: string;
  statuses: Readonly<Record<PublicCohort["status"], string>>;
}>;

function dateLabel(value: string, locale: FundingLocale): string {
  return new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "UTC"}).format(new Date(`${value}T00:00:00Z`));
}

export function CohortCalendar({
  cohorts,
  locale,
  labels,
}: Readonly<{
  cohorts: readonly PublicCohort[];
  locale: FundingLocale;
  labels: CohortCalendarLabels;
}>) {
  if (!cohorts.length) return <p className="text-muted-foreground">{labels.empty}</p>;
  return <div aria-label={labels.title} className="grid gap-4 md:grid-cols-2">
    {cohorts.map((cohort) => <article className="glass-card space-y-3 p-5" key={cohort.id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">{locale === "zh-HK" ? cohort.nameZhHk : cohort.nameEn}</h3><span className="rounded-full border px-2 py-1 text-xs">{labels.statuses[cohort.status]}</span></div>
      <p className="text-sm text-muted-foreground">{locale === "zh-HK" ? cohort.descriptionZhHk : cohort.descriptionEn}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="font-medium">{labels.starts}</dt><dd>{dateLabel(cohort.startsOn, locale)}</dd></div><div><dt className="font-medium">{labels.ends}</dt><dd>{cohort.endsOn ? dateLabel(cohort.endsOn, locale) : labels.noEnd}</dd></div><div><dt className="font-medium">{labels.capacity}</dt><dd>{cohort.capacity}</dd></div><div><dt className="font-medium">{labels.fee}</dt><dd>{new Intl.NumberFormat(locale, {style: "currency", currency: "HKD", maximumFractionDigits: 0}).format(cohort.feeHkd)}</dd></div></dl>
    </article>)}
  </div>;
}
