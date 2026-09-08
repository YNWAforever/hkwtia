import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";
import {ZodError} from "zod";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {eventsRepository} from "@/lib/db/repos/events";
import {saveMemberEventAction} from "@/lib/events/member-actions";
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
  // The layout redirects anonymous visitors too, but Next renders layout and
  // page in parallel, so a page-level requireActor() would throw UNAUTHORIZED
  // into the runtime log on every anonymous hit (audit F21). Redirect here as
  // well; the continuation allowlist (lib/portal/continuation.ts) accepts
  // /portal/events/<uuid>/edit, so sign-in returns to this row.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent(`/portal/events/${id}/edit`)}`);
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  // FORBIDDEN (another company's row, or an admin-authored one) and an invalid
  // id (a ZodError from the id schema) both render as not-found: the member
  // learns nothing about rows they cannot edit. Anything else, a database
  // outage above all, must surface as an error rather than a quiet 404.
  const row = await eventsRepository.getForMemberEdit(actor, id).catch((error: unknown) => {
    if (error instanceof ZodError || (error instanceof Error && error.message === "FORBIDDEN")) return null;
    throw error;
  });
  if (!row) notFound();
  const values = memberEventViewFromRow(row);
  const context = await loadMemberEventsContext(actor).catch(() => null);
  const saved = (await searchParams).saved;
  const notice = saved === "submit" ? t("submitted") : saved === "draft" ? t("draftSaved") : null;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t(`status.${values.status}`)}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{values.titleEn}</h1>
        {values.rejectionReason ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t("rejectedWith", {reason: values.rejectionReason})}</p> : null}
      </header>
      <EventForm action={saveMemberEventAction.bind(null, locale)} canSubmit={Boolean(context?.canPublish) || values.status === "pending_review"} labels={eventFormLabels(t)} notice={notice} values={values} />
    </div>
  );
}
