import Link from "next/link";

import {
  AutomationRetryForm,
  type RetryAutomationAction,
} from "@/components/admin/automation-retry-form";
import type {AutomationDashboard} from "@/lib/admin/automations";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type {RetryAutomationAction};

export type AutomationDashboardLabels = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  snapshot: string;
  countsLabel: string;
  due: string;
  upcoming: string;
  failed: string;
  processing: string;
  jobsHeading: string;
  jobsCaption: string;
  jobsEmpty: string;
  queueHeading: string;
  queueCaption: string;
  queueEmpty: string;
  kind: string;
  state: string;
  updatedAt: string;
  errorCode: string;
  journey: string;
  step: string;
  status: string;
  scheduledAt: string;
  attemptCount: string;
  actions: string;
  retry: string;
  retrying: string;
  retryScheduled: string;
  retryValidation: string;
  retryUnavailable: string;
  retryError: string;
  notAvailable: string;
  next: string;
}>;

type AutomationDashboardViewProps = Readonly<{
  action: RetryAutomationAction;
  dashboard: AutomationDashboard;
  labels: AutomationDashboardLabels;
  locale: AppLocale;
}>;

export function AutomationDashboardView({
  action,
  dashboard,
  labels,
  locale,
}: AutomationDashboardViewProps) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  const displayDate = (value: string) => formatter.format(new Date(value));
  const nextHref = dashboard.nextCursor
    ? localizedPath(
        locale,
        `/admin/automations?${new URLSearchParams({
          cursor: dashboard.nextCursor,
        }).toString()}`,
      )
    : null;
  const counts = [
    {key: "due", label: labels.due, value: dashboard.counts.due},
    {
      key: "upcoming",
      label: labels.upcoming,
      value: dashboard.counts.upcoming,
    },
    {key: "failed", label: labels.failed, value: dashboard.counts.failed},
    {
      key: "processing",
      label: labels.processing,
      value: dashboard.counts.processing,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          {labels.eyebrow}
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {labels.title}
        </h1>
        <p className="text-lg text-muted-foreground">{labels.description}</p>
        <p className="text-sm text-muted-foreground">
          {labels.snapshot}{" "}
          <time dateTime={dashboard.asOf}>{displayDate(dashboard.asOf)}</time>
        </p>
      </header>

      <section aria-label={labels.countsLabel}>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {counts.map((count) => (
            <div className="glass-card p-5" key={count.key}>
              <dt className="text-sm text-muted-foreground">{count.label}</dt>
              <dd className="mt-2 font-serif text-3xl font-semibold">
                {count.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="automation-jobs-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="automation-jobs-heading"
        >
          {labels.jobsHeading}
        </h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-sm">
            <caption>{labels.jobsCaption}</caption>
            <thead className="border-y border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3" scope="col">{labels.kind}</th>
                <th className="px-4 py-3" scope="col">{labels.state}</th>
                <th className="px-4 py-3" scope="col">{labels.updatedAt}</th>
                <th className="px-4 py-3" scope="col">{labels.errorCode}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.jobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-muted-foreground" colSpan={4}>
                    {labels.jobsEmpty}
                  </td>
                </tr>
              ) : dashboard.jobs.map((job) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={`${job.kind}:${job.state}:${job.updatedAt}:${job.errorCode ?? ""}`}
                >
                  <th className="px-4 py-3 font-medium" scope="row">
                    {job.kind}
                  </th>
                  <td className="px-4 py-3">{job.state}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <time dateTime={job.updatedAt}>
                      {displayDate(job.updatedAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {job.errorCode ?? labels.notAvailable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="automation-queue-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="automation-queue-heading"
        >
          {labels.queueHeading}
        </h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-sm">
            <caption>{labels.queueCaption}</caption>
            <thead className="border-y border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3" scope="col">{labels.journey}</th>
                <th className="px-4 py-3" scope="col">{labels.step}</th>
                <th className="px-4 py-3" scope="col">{labels.status}</th>
                <th className="px-4 py-3" scope="col">{labels.scheduledAt}</th>
                <th className="px-4 py-3" scope="col">{labels.attemptCount}</th>
                <th className="px-4 py-3" scope="col">{labels.errorCode}</th>
                <th className="px-4 py-3" scope="col">{labels.actions}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-muted-foreground" colSpan={7}>
                    {labels.queueEmpty}
                  </td>
                </tr>
              ) : dashboard.rows.map((row) => (
                <tr
                  className="border-b border-border align-top last:border-0"
                  key={row.id}
                >
                  <th className="px-4 py-3 font-medium" scope="row">
                    {row.journey}
                  </th>
                  <td className="px-4 py-3">{row.step}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <time dateTime={row.scheduledAt}>
                      {displayDate(row.scheduledAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3">{row.attemptCount}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.errorCode ?? labels.notAvailable}
                  </td>
                  <td className="px-4 py-3">
                    {row.retryable ? (
                      <AutomationRetryForm
                        action={action}
                        journeyId={row.id}
                        labels={labels}
                        locale={locale}
                      />
                    ) : labels.notAvailable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextHref ? (
          <nav aria-label={labels.queueCaption} className="flex justify-end">
            <Link
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
              href={nextHref}
            >
              {labels.next}
            </Link>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
