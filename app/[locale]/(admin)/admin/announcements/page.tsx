import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {AnnouncementForm, type AnnouncementFormLabels} from "@/components/admin/announcement-form";
import type {AppLocale} from "@/i18n/routing";
import {createAnnouncementAction} from "@/lib/admin/announcement-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {announcementsRepository} from "@/lib/db/repos/announcements";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminAnnouncementsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rows = await announcementsRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.announcements"});
  const messages = {
    successMessage: t("createSuccess"),
    validationMessage: t("validation"),
    errorMessage: t("error"),
  };
  const labels: AnnouncementFormLabels = {
    titleEn: t("titleEn"), titleZhHk: t("titleZhHk"),
    ctaLabelEn: t("ctaLabelEn"), ctaLabelZhHk: t("ctaLabelZhHk"),
    href: t("href"), startsAt: t("startsAt"), endsAt: t("endsAt"),
    timeHelp: t("timeHelp"), priority: t("priority"), priorityHelp: t("priorityHelp"),
    save: t("create"), saving: t("saving"),
  };

  return <div className="space-y-8">
    <header>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </header>
    <AnnouncementForm action={createAnnouncementAction.bind(null, `/${locale}/admin/announcements`, messages)} labels={labels}/>
    <section className="glass-card p-6">
      <h2 className="font-serif text-2xl font-semibold">{t("existing")}</h2>
      {rows.length ? <ul className="divide-y">{rows.map((row) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={row.id}>
        <Link className="underline" href={localizedPath(locale, `/admin/announcements/${row.id}`)}>
          {locale === "zh-HK" ? row.titleZhHk : row.titleEn}
        </Link>
        <span className="text-sm text-muted-foreground">
          {row.archivedAt ? t("statusArchived") : row.publishedAt ? t("statusPublished") : t("statusDraft")}
        </span>
      </li>)}</ul> : <p>{t("empty")}</p>}
    </section>
  </div>;
}
