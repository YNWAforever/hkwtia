import Link from "next/link";

import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventForm} from "@/components/admin/event-form";
import type {AppLocale} from "@/i18n/routing";
import {createEventAction} from "@/lib/admin/event-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

import {eventsRepository} from "@/lib/db/repos/events";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminEventsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const events = await eventsRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  const createActionMessages = {successMessage: t("createSuccess"), validationMessage: t("validation"), errorMessage: t("error")};
  const createAction = createEventAction.bind(null, "/" + locale + "/admin/events-mgmt", createActionMessages);
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), memberOnly: t("memberOnly"), published: t("published"), save: t("create"), saving: t("saving")};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header><EventForm action={createAction} labels={labels}/><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("existing")}</h2>{events.length ? <ul className="divide-y">{events.map((event) => <li className="py-3" key={event.id}><Link className="underline" href={localizedPath(locale, `/admin/events-mgmt/${event.id}`)}>{locale === "zh-HK" && event.titleZh ? event.titleZh : event.titleEn}</Link></li>)}</ul> : <p>{t("empty")}</p>}</section></div>;
}
