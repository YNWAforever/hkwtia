import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";
import {ZodError} from "zod";

import {EventForm} from "@/components/portal/event-form";
import {PortalPageHeader} from "@/components/portal/page-header";
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
  const tForms = await getTranslations({locale, namespace: "Portal.forms"});
  // FORBIDDEN (another company's row, or an admin-authored one) and an invalid
  // id (a ZodError from the id schema) both render as not-found: the member
  // learns nothing about rows they cannot edit. Anything else, a database
  // outage above all, must surface as an error rather than a quiet 404.
  const row = await eventsRepository.getForMemberEdit(actor, id).catch((error: unknown) => {
    if (error instanceof ZodError || (error instanceof Error && error.message === "FORBIDDEN")) return null;
    throw error;
  });
  if (!row?.organiser_company_id) notFound();
  const values = memberEventViewFromRow(row);
  const context = await loadMemberEventsContext(actor, undefined, {companyId: row.organiser_company_id, excludeEventId: id}).catch((error: unknown) => {
    if (error instanceof Error && error.message === "MEMBERSHIP_INACTIVE") return "NO_MEMBERSHIP_FOR_COMPANY";
    if (error instanceof Error && (error.message === "NO_MANAGED_COMPANY" || error.message === "NO_MEMBERSHIP_FOR_COMPANY")) return error.message;
    throw error;
  });
  const saved = (await searchParams).saved;
  const notice = saved === "submit" ? t("submitted") : saved === "draft" ? t("draftSaved") : null;
  return (
    <div className="portal-event-editor">
      {/* The status word is the eyebrow; the reason WTIA returned the event is a sentence the member
          acts on, so it is body text in the alert block, not part of the 11px label. */}
      <PortalPageHeader eyebrow={t(`status.${values.status}`)} title={values.titleEn}>
        {values.rejectionReason ? <p className="portal-form-alert">{t("rejectedWith", {reason: values.rejectionReason})}</p> : null}
      </PortalPageHeader>
      {typeof context === "string" ? <p className="portal-form-alert" role="alert">{t(`errors.${context}`)}</p> : null}
      <EventForm action={saveMemberEventAction.bind(null, locale, row.organiser_company_id)} canSaveDraft={typeof context !== "string"} canUploadHero={typeof context !== "string" && context.limit > 0} canSubmit={typeof context !== "string" && (context.canPublish)} labels={eventFormLabels(t, tForms)} notice={notice} values={values} />
    </div>
  );
}
