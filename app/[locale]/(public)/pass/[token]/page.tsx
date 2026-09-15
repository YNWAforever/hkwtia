import {notFound} from "next/navigation";

import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {appEnv, ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository, type PassView} from "@/lib/db/repos/ticket-check-in";
import {localizedPath} from "@/lib/urls";
import {qrSvg} from "@/lib/tickets/qr";
import {signPassToken, verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";

export type PassPageData = Readonly<{
  attendeeName: string; position: number; eventTitle: string; eventStartsAt: Date;
  eventVenue: string | null; checkedInAt: Date | null; checkInUrl: string; qr: string;
}>;

export type PassPageDependencies = Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassView | null>;
}>;

/**
 * The QR encodes the STAFF check-in URL, never the pass URL, so a page anyone
 * may open publishes nothing writable. Staff scan with the native camera and
 * land on the only surface that can admit someone.
 *
 * The token is re-signed from the verified claims rather than echoed from the
 * URL, so a token that verified once is normalized before it is encoded.
 */
export async function loadPassPage(token: string, dependencies: PassPageDependencies = {
  verify: (value) => verifyPassToken(value, ticketPassEnv().ticketPassTokenSecret),
  passForSeat: (claims) => ticketCheckInRepository.passForSeat(claims),
}): Promise<PassPageData | null> {
  const claims = dependencies.verify(token);
  if (!claims) return null;
  const view = await dependencies.passForSeat(claims);
  if (!view) return null;
  const locale = view.buyerLocale;
  const checkInUrl = `${appEnv().appUrl}${localizedPath(locale, `/admin/check-in/${signPassToken(claims, ticketPassEnv().ticketPassTokenSecret)}`)}`;
  return {
    attendeeName: view.attendeeName,
    position: view.position,
    eventTitle: locale === "zh-HK" ? view.eventTitleZh ?? view.eventTitleEn : view.eventTitleEn,
    eventStartsAt: view.eventStartsAt,
    eventVenue: view.eventVenue,
    checkedInAt: view.checkedInAt,
    checkInUrl,
    qr: await qrSvg(checkInUrl),
  };
}

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
