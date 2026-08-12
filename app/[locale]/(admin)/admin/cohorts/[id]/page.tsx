import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {CohortForm} from "@/components/admin/cohort-form";
import type {AppLocale} from "@/i18n/routing";
import {updateCohortAction} from "@/lib/admin/cohort-actions";
import {cohortFormLabels, cohortFormMessages} from "@/lib/admin/cohort-labels";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {cohortRepository} from "@/lib/db/repos/cohorts";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminCohortDetailPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  // The repository rejects a malformed id by returning null, so a hand-typed
  // URL is a 404 rather than a 500.
  const cohort = await cohortRepository.getCohortForAdmin(actor, id);
  if (!cohort) notFound();
  const t = await getTranslations({locale, namespace: "Admin.cohorts"});
  const path = localizedPath(locale, "/admin/cohorts");
  const updateAction = updateCohortAction.bind(null, cohort.id, path, cohortFormMessages(t));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("manage.editEyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">
          {locale === "zh-HK" ? cohort.nameZhHk : cohort.nameEn}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">{cohort.slug}</p>
        <Link className="text-sm underline" href={localizedPath(locale, "/admin/cohorts")}>{t("manage.back")}</Link>
      </header>
      <CohortForm
        action={updateAction}
        labels={{...cohortFormLabels(t), save: t("manage.save"), saving: t("manage.saving")}}
        values={{
          slug: cohort.slug,
          nameEn: cohort.nameEn,
          nameZhHk: cohort.nameZhHk,
          descriptionEn: cohort.descriptionEn,
          descriptionZhHk: cohort.descriptionZhHk,
          track: cohort.track,
          startsOn: cohort.startsOn,
          endsOn: cohort.endsOn,
          capacity: cohort.capacity,
          feeHkd: cohort.feeHkd,
          status: cohort.status,
        }}
      />
    </div>
  );
}
