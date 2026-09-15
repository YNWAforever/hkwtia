import "server-only";

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
 *
 * Lives outside the route module because Next allows a `page.tsx` to export
 * only framework fields; the unit test drives this function directly.
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
