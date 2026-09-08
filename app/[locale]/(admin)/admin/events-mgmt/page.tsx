import Link from "next/link";

import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventForm} from "@/components/admin/event-form";
import {EventReviewTable, type ReviewRow} from "@/components/admin/event-review-table";
import type {AppLocale} from "@/i18n/routing";
import {createEventAction} from "@/lib/admin/event-actions";
import {approveMemberEventAction, rejectMemberEventAction} from "@/lib/admin/event-review-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

import {eventsRepository} from "@/lib/db/repos/events";
import {mediaRepository} from "@/lib/db/repos/media";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminEventsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const [events, mediaRows, pendingRows, t] = await Promise.all([
    eventsRepository.listForAdmin(actor),
    mediaRepository.listActiveForAdmin(actor),
    // A failed review-queue read must not look like an empty queue: null
    // renders an explicit error while the rest of the page still renders.
    eventsRepository.listForReview(actor).catch(() => null),
    getTranslations({locale, namespace: "Admin.eventsMgmt"}),
  ]);
  const path = "/" + locale + "/admin/events-mgmt";
  const createActionMessages = {successMessage: t("createSuccess"), validationMessage: t("validation"), errorMessage: t("error")};
  const createAction = createEventAction.bind(null, path, createActionMessages);
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), memberOnly: t("memberOnly"), published: t("published"), heroMediaId: t("heroMediaId"), noHeroMedia: t("noHeroMedia"), save: t("create"), saving: t("saving")};
  // Snake_case rows from the raw-SQL seam, mapped field by field so the table
  // never renders a raw database row.
  const reviewRows: ReviewRow[] | null = pendingRows === null ? null : pendingRows.map((row) => ({
    id: row.id, slug: row.slug, titleEn: row.title_en, titleZh: row.title_zh, startsAt: row.starts_at, organiser: row.organiser_name ?? null,
    submittedAt: row.submitted_at, format: row.format, visibility: row.visibility,
  }));
  const reviewLabels = {caption: t("review.caption"), event: t("review.event"), organiser: t("review.organiser"), starts: t("review.starts"), submitted: t("review.submitted"), format: t("review.format"), visibility: t("review.visibility"), approve: t("review.approve"), reject: t("review.reject"), rejectionReason: t("review.rejectionReason"), empty: t("review.empty")};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("review.title")}</h2>{reviewRows === null ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("review.error")}</p> : <EventReviewTable approveAction={approveMemberEventAction.bind(null, path)} labels={reviewLabels} locale={locale} rejectAction={rejectMemberEventAction.bind(null, path)} rows={reviewRows}/>}</section><EventForm action={createAction} labels={labels} mediaRows={mediaRows}/><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("existing")}</h2>{events.length ? <ul className="divide-y">{events.map((event) => <li className="py-3" key={event.id}><Link className="underline" href={localizedPath(locale, `/admin/events-mgmt/${event.id}`)}>{locale === "zh-HK" && event.titleZh ? event.titleZh : event.titleEn}</Link></li>)}</ul> : <p>{t("empty")}</p>}</section></div>;
}
