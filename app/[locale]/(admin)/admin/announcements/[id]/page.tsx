import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {
  AnnouncementForm,
  AnnouncementLifecycleControls,
  type AnnouncementFormLabels,
} from "@/components/admin/announcement-form";
import type {AppLocale} from "@/i18n/routing";
import {
  setAnnouncementArchivedAction,
  setAnnouncementPublishedAction,
  updateAnnouncementAction,
} from "@/lib/admin/announcement-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {announcementsRepository} from "@/lib/db/repos/announcements";

const idSchema = z.string().uuid();
type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminAnnouncementDetailPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  const row = await announcementsRepository.getForAdmin(actor, parsedId.data);
  if (!row) notFound();
  const t = await getTranslations({locale, namespace: "Admin.announcements"});
  const path = `/${locale}/admin/announcements/${parsedId.data}`;
  const messages = {
    successMessage: t("updateSuccess"),
    validationMessage: t("validation"),
    errorMessage: t("error"),
  };
  const labels: AnnouncementFormLabels = {
    titleEn: t("titleEn"), titleZhHk: t("titleZhHk"),
    ctaLabelEn: t("ctaLabelEn"), ctaLabelZhHk: t("ctaLabelZhHk"),
    href: t("href"), startsAt: t("startsAt"), endsAt: t("endsAt"),
    timeHelp: t("timeHelp"), priority: t("priority"), priorityHelp: t("priorityHelp"),
    save: t("save"), saving: t("saving"),
  };

  return <div className="space-y-8">
    <header>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("editEyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold">{locale === "zh-HK" ? row.titleZhHk : row.titleEn}</h1>
      <p className="text-muted-foreground">
        {row.archivedAt ? t("statusArchived") : row.publishedAt ? t("statusPublished") : t("statusDraft")}
      </p>
    </header>
    <AnnouncementForm action={updateAnnouncementAction.bind(null, parsedId.data, path, messages)} labels={labels} values={row}/>
    <AnnouncementLifecycleControls
      archiveAction={setAnnouncementArchivedAction.bind(null, parsedId.data, path, row.archivedAt === null)}
      archived={row.archivedAt !== null}
      labels={{
        publish: t("publish"), unpublish: t("unpublish"),
        archive: t("archive"), unarchive: t("unarchive"),
        saving: t("saving"), error: t("error"), archivedNotice: t("archivedNotice"),
      }}
      publishAction={setAnnouncementPublishedAction.bind(null, parsedId.data, path, row.publishedAt === null)}
      published={row.publishedAt !== null}
    />
  </div>;
}
