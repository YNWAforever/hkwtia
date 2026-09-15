import Link from "next/link";
import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import {CheckInForm} from "@/components/admin/check-in-form";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {loadCheckIn} from "@/lib/tickets/check-in-page";
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
  const messages = {
    successMessage: t("checkInSuccess"),
    successMessageAlready: t("alreadyCheckedIn"),
    successMessageUndone: t("undoSuccess"),
    notCheckedInMessage: t("notCheckedIn"),
    notAdmissibleMessage: t("notAdmissible"),
    errorMessage: t("updateError"),
  };
  const labels = {checkIn: t("checkIn"), undo: t("undo"), alreadyCheckedIn: t("alreadyCheckedIn")};
  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{t("seat", {position: result.seat.position})}</p>
      </header>
      <section className="glass-card space-y-4 p-6">
        <p className="text-lg font-medium">{result.seat.attendeeName}</p>
        <CheckInForm
          checkedIn={result.state === "already_checked_in"}
          checkInPath={`/${locale}/admin/check-in/${token}`}
          eventPath={`/${locale}/admin/events-mgmt/${result.seat.eventId}`}
          labels={labels}
          messages={messages}
          seatId={result.seat.seatId}
        />
        <Link className="text-sm underline" href={localizedPath(locale, `/admin/events-mgmt/${result.seat.eventId}`)}>{t("backToEvent")}</Link>
      </section>
    </main>
  );
}
