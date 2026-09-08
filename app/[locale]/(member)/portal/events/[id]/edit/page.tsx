import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {eventsRepository} from "@/lib/db/repos/events";
import {saveMemberEventDraftAction, submitMemberEventAction} from "@/lib/events/member-actions";
import {memberEventViewFromRow} from "@/lib/events/member-contract";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels} from "../../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; id: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function EditMemberEventPage({params, searchParams}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The portal layout's continuation allowlist doesn't cover this deep path,
  // so the page-level redirect is what preserves /portal/events/{id}/edit as
  // the post-login destination.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent(`/portal/events/${id}/edit`)}`);
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  // FORBIDDEN (another company's row, or an admin-authored one) and an invalid
  // id both render as not-found: the member learns nothing about rows they
  // cannot edit.
  const row = await eventsRepository.getForMemberEdit(actor, id).catch(() => null);
  if (!row) notFound();
  const values = memberEventViewFromRow(row);
  const context = await loadMemberEventsContext(actor).catch(() => null);
  const saved = (await searchParams).saved;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t(`status.${values.status}`)}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{values.titleEn}</h1>
        {saved === "submit" ? <p className="text-muted-foreground" role="status">{t("submitted")}</p> : saved === "draft" ? <p className="text-muted-foreground" role="status">{t("draftSaved")}</p> : null}
        {values.rejectionReason ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t("rejectedWith", {reason: values.rejectionReason})}</p> : null}
      </header>
      <EventForm canSubmit={Boolean(context?.canPublish) || values.status === "pending_review"} draftAction={saveMemberEventDraftAction.bind(null, locale)} labels={eventFormLabels(t)} submitAction={submitMemberEventAction.bind(null, locale)} values={values} />
    </div>
  );
}
