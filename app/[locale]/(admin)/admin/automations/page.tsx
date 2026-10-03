import {getTranslations, setRequestLocale} from "next-intl/server";

import {
  AutomationDashboardView,
  type AutomationDashboardLabels,
  type JobHealthLabels,
} from "@/components/admin/automation-dashboard";
import {InternalPageHeader} from "@/components/internal-shell/page-header";
import type {AppLocale} from "@/i18n/routing";
import {retryAutomationAction} from "@/lib/admin/automation-actions";
import {readJobHealth} from "@/lib/jobs/health";
import {HEALTH_JOB_KEYS} from "@/lib/jobs/health-registry";
import {getAutomationDashboard} from "@/lib/admin/automations";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function AdminAutomationsPage({
  params,
  searchParams,
}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const query = await searchParams;
  const [dashboard,health] = await Promise.all([getAutomationDashboard(actor, query),readJobHealth(actor)]);
  const t = await getTranslations({
    locale,
    namespace: "Admin.automations",
  });
  const labels: AutomationDashboardLabels = {
    evaluatedAt: t("evaluatedAt"),
    countsLabel: t("countsLabel"),
    due: t("due"),
    upcoming: t("upcoming"),
    failed: t("failed"),
    processing: t("processing"),
    jobsHeading: t("jobsHeading"),
    jobsCaption: t("jobsCaption"),
    jobsEmpty: t("jobsEmpty"),
    queueHeading: t("queueHeading"),
    queueCaption: t("queueCaption"),
    queueEmpty: t("queueEmpty"),
    kind: t("kind"),
    state: t("state"),
    updatedAt: t("updatedAt"),
    errorCode: t("errorCode"),
    journey: t("journey"),
    step: t("step"),
    status: t("status"),
    scheduledAt: t("scheduledAt"),
    attemptCount: t("attemptCount"),
    actions: t("actions"),
    retry: t("retry"),
    retrying: t("retrying"),
    retryScheduled: t("retryScheduled"),
    retryValidation: t("retryValidation"),
    retryUnavailable: t("retryUnavailable"),
    retryError: t("retryError"),
    notAvailable: t("notAvailable"),
    next: t("next"),
  };

  const h=await getTranslations({locale,namespace:"Admin.jobHealth"});
  const healthLabels:JobHealthLabels={heading:h("heading"),description:h("description"),job:h("job"),state:h("state"),lastStarted:h("lastStarted"),lastSuccess:h("lastSuccess"),nextExpected:h("nextExpected"),oldestPending:h("oldestPending"),failed:h("failed"),uncertain:h("uncertain"),deployment:h("deployment"),unobserved:h("unobserved"),states:{healthy:h("states.healthy"),degraded:h("states.degraded"),disabled:h("states.disabled"),unknown:h("states.unknown")},jobs:Object.fromEntries(HEALTH_JOB_KEYS.map(key=>[key,h(`jobs.${key}`)]))};
  return (
    <div className="space-y-8">
      <InternalPageHeader description={t("description")} eyebrow={t("eyebrow")} title={t("title")}/>
      <AutomationDashboardView
        action={retryAutomationAction}
        dashboard={dashboard}
        health={health}
        healthLabels={healthLabels}
        labels={labels}
        locale={locale}
      />
    </div>
  );
}
