import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {CohortForm} from "@/components/admin/cohort-form";
import {CohortKanban} from "@/components/admin/cohort-kanban";
import type {AppLocale} from "@/i18n/routing";
import {createCohortAction, moveCohortApplicationAction} from "@/lib/admin/cohort-actions";
import {cohortFormLabels, cohortFormMessages} from "@/lib/admin/cohort-labels";
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
  const [applications, cohorts] = await Promise.all([
    cohortRepository.listForAdmin(actor),
    cohortRepository.listCohortsForAdmin(actor),
  ]);
  const t = await getTranslations({locale, namespace: "Admin.cohorts"});
  const path = localizedPath(locale, "/admin/cohorts");
  const labels = {
    title: t("title"), description: t("description"), application: t("application"), moveTo: t("moveTo"), notes: t("notes"), move: t("move"), moving: t("moving"), empty: t("empty"),
    errors: {invalid: t("errors.invalid"), forbidden: t("errors.forbidden"), error: t("errors.error")},
    stages: {applied: t("stages.applied"), accepted: t("stages.accepted"), ready: t("stages.ready"), match: t("stages.match"), land: t("stages.land"), scale: t("stages.scale"), graduated: t("stages.graduated"), rejected: t("stages.rejected")},
  };
  const kanbanApplications = applications.map(({id, stage, companyDisplayName, cohortSlug, cohortNameEn, cohortNameZhHk}) => ({
    id,
    stage,
    companyDisplayName,
    cohortSlug,
    cohortName: locale === "zh-HK" ? cohortNameZhHk : cohortNameEn,
  }));
  const formLabels = cohortFormLabels(t);
  const createAction = createCohortAction.bind(null, path, cohortFormMessages(t));

  return (
    <div className="space-y-10">
      <CohortKanban applications={kanbanApplications} labels={labels} moveAction={moveCohortApplicationAction.bind(null, path)}/>
      <section className="space-y-4">
        <header className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold">{t("manage.createHeading")}</h2>
          <p className="text-muted-foreground">{t("manage.createDescription")}</p>
        </header>
        <CohortForm action={createAction} labels={{...formLabels, save: t("manage.create"), saving: t("manage.saving")}}/>
      </section>
      <section className="glass-card space-y-3 p-6">
        <h2 className="font-serif text-2xl font-semibold">{t("manage.existing")}</h2>
        {cohorts.length
          ? <ul className="divide-y">{cohorts.map((cohort) => (
            <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={cohort.id}>
              <Link className="underline" href={localizedPath(locale, `/admin/cohorts/${cohort.id}`)}>
                {locale === "zh-HK" ? cohort.nameZhHk : cohort.nameEn}
              </Link>
              <span className="text-sm text-muted-foreground">
                {t(`manage.statuses.${cohort.status}`)} · {cohort.startsOn}
              </span>
            </li>
          ))}</ul>
          : <p>{t("manage.noCohorts")}</p>}
      </section>
    </div>
  );
}
