import Link from "next/link";
import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {loadCheckIn} from "@/lib/tickets/check-in-page";
import {submitSeatCheckInAction, submitSeatUndoAction} from "@/lib/tickets/check-in-actions";
import {localizedPath} from "@/lib/urls";

export default async function CheckInPage({params}: Readonly<{params: Promise<{locale: string; token: string}>}>) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The session check comes BEFORE any seat read, so a non-staff visitor learns nothing.
  await requireAdminPageActor();
  const result = await loadCheckIn(token);
  if (!result) notFound();
  const t = await getTranslations({locale, namespace: "Admin.checkIn"});
  const title = locale === "zh-HK" ? result.seat.eventTitleZh ?? result.seat.eventTitleEn : result.seat.eventTitleEn;
  // The wrappers return a state for `useActionState`; these plain forms discard
  // it, and a React `form action` must return `void`, so each is adapted here.
  const checkIn = async (formData: FormData) => { await submitSeatCheckInAction({}, formData); };
  const undo = async (formData: FormData) => { await submitSeatUndoAction({}, formData); };
  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{t("seat", {position: result.seat.position})}</p>
      </header>
      <section className="glass-card space-y-4 p-6">
        <p className="text-lg font-medium">{result.seat.attendeeName}</p>
        {result.state === "already_checked_in" ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">{t("alreadyCheckedIn")}</p>
            <form action={undo}>
              <input name="seatId" type="hidden" value={result.seat.seatId}/>
              <button className="min-h-11 rounded-md border px-4" type="submit">{t("undo")}</button>
            </form>
          </>
        ) : (
          <form action={checkIn}>
            <input name="seatId" type="hidden" value={result.seat.seatId}/>
            <button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t("checkIn")}</button>
          </form>
        )}
        <Link className="text-sm underline" href={localizedPath(locale, `/admin/events-mgmt/${result.seat.eventId}`)}>{t("backToEvent")}</Link>
      </section>
    </main>
  );
}
