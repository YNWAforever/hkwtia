import "server-only";

import {appEnv, ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository, type PassSeatResult} from "@/lib/db/repos/ticket-check-in";
import {localizedPath} from "@/lib/urls";
import {qrSvg} from "@/lib/tickets/qr";
import {signPassToken, verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";

/**
 * A cancelled pass is its own shape, not the active pass minus a QR: it carries
 * only the facts that identify the event, so a cancelled result cannot leak a
 * check-in URL or a scannable code into a page for an event that will not
 * happen.
 */
export type PassPageData =
  | Readonly<{
      state: "active"; attendeeName: string; position: number; eventTitle: string;
      eventStartsAt: Date; eventVenue: string | null; checkedInAt: Date | null;
      checkInUrl: string; qr: string;
    }>
  | Readonly<{
      state: "cancelled"; attendeeName: string; eventTitle: string;
      eventStartsAt: Date; eventVenue: string | null;
    }>;

export type PassPageDependencies = Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassSeatResult>;
  qr?: (text: string) => Promise<string>;
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
  const result = await dependencies.passForSeat(claims);
  // Only an `unavailable` seat 404s; a cancelled one is a rendered state.
  if (result.status === "unavailable") return null;
  const view = result.view;
  const locale = view.buyerLocale;
  const eventTitle = locale === "zh-HK" ? view.eventTitleZh ?? view.eventTitleEn : view.eventTitleEn;
  if (result.status === "cancelled") {
    return {
      state: "cancelled",
      attendeeName: view.attendeeName,
      eventTitle,
      eventStartsAt: view.eventStartsAt,
      eventVenue: view.eventVenue,
    };
  }
  const checkInUrl = `${appEnv().appUrl}${localizedPath(locale, `/admin/check-in/${signPassToken(claims, ticketPassEnv().ticketPassTokenSecret)}`)}`;
  return {
    state: "active",
    attendeeName: view.attendeeName,
    position: view.position,
    eventTitle,
    eventStartsAt: view.eventStartsAt,
    eventVenue: view.eventVenue,
    checkedInAt: view.checkedInAt,
    checkInUrl,
    qr: await (dependencies.qr ?? qrSvg)(checkInUrl),
  };
}
