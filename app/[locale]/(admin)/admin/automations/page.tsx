import {getTranslations, setRequestLocale} from "next-intl/server";

import {
  AutomationDashboardView,
  type AutomationDashboardLabels,
} from "@/components/admin/automation-dashboard";
import type {AppLocale} from "@/i18n/routing";
import {retryAutomationAction} from "@/lib/admin/automation-actions";
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
  const dashboard = await getAutomationDashboard(actor, query);
  const t = await getTranslations({
    locale,
    namespace: "Admin.automations",
  });
  const labels: AutomationDashboardLabels = {
    eyebrow: t("eyebrow"),
    title: t("title"),
    description: t("description"),
    snapshot: t("snapshot"),
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

  return (
    <AutomationDashboardView
      action={retryAutomationAction}
      dashboard={dashboard}
      labels={labels}
      locale={locale}
    />
  );
}
