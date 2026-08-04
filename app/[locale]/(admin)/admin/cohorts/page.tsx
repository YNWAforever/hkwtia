import {getTranslations, setRequestLocale} from "next-intl/server";

import {CohortKanban} from "@/components/admin/cohort-kanban";
import type {AppLocale} from "@/i18n/routing";
import {moveCohortApplicationAction} from "@/lib/admin/cohort-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {cohortRepository} from "@/lib/db/repos/cohorts";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminCohortsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const applications = await cohortRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.cohorts"});
  const path = localizedPath(locale, "/admin/cohorts");
  const labels = {
    title: t("title"), description: t("description"), application: t("application"), moveTo: t("moveTo"), notes: t("notes"), move: t("move"), moving: t("moving"), empty: t("empty"),
    errors: {invalid: t("errors.invalid"), forbidden: t("errors.forbidden"), error: t("errors.error")},
    stages: {applied: t("stages.applied"), accepted: t("stages.accepted"), ready: t("stages.ready"), match: t("stages.match"), land: t("stages.land"), scale: t("stages.scale"), graduated: t("stages.graduated"), rejected: t("stages.rejected")},
  };
  const kanbanApplications = applications.map(({id, stage}) => ({id, stage}));
  return <CohortKanban applications={kanbanApplications} labels={labels} moveAction={moveCohortApplicationAction.bind(null, path)}/>;
}
