import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {loadPassPage} from "@/lib/tickets/pass-page";

export const metadata = {robots: {index: false, follow: false}};

export default async function PassPage({params}: Readonly<{params: Promise<{locale: string; token: string}>}>) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const data = await loadPassPage(token);
  if (!data) notFound();
  const t = await getTranslations({locale, namespace: "Pass"});
  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-3xl font-semibold">{data.eventTitle}</h1>
        <p className="text-muted-foreground">{new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {dateStyle: "full", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(data.eventStartsAt)}{data.eventVenue ? ` · ${data.eventVenue}` : ""}</p>
      </header>
      <section className="glass-card space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t("attendee")}</p>
        <p className="font-medium">{data.attendeeName}</p>
        <p className="text-sm text-muted-foreground">{t("seat", {position: data.position})}</p>
        {/* The QR is SVG produced by our own server; there is no user-supplied markup here. */}
        <div aria-label={t("qrLabel")} className="mx-auto w-64 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{__html: data.qr}} role="img"/>
        {data.checkedInAt ? <p className="text-sm text-muted-foreground" role="status">{t("checkedIn")}</p> : null}
        <p className="text-xs text-muted-foreground">{t("presentAtDoor")}</p>
      </section>
    </div>
  );
}
