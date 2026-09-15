import "server-only";

import {ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository, type PassView} from "@/lib/db/repos/ticket-check-in";
import {verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";

export type CheckInState = "ready" | "already_checked_in";

export type CheckInPageData = Readonly<{state: CheckInState; seat: PassView}>;

export type CheckInPageDependencies = Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassView | null>;
}>;

/**
 * Lives outside the route module because Next allows a `page.tsx` to export
 * only framework fields; the unit test drives this function directly.
 */
export function createCheckInLoader(dependencies: CheckInPageDependencies) {
  return async function loadCheckIn(token: string): Promise<CheckInPageData | null> {
    const claims = dependencies.verify(token);
    if (!claims) return null;
    const seat = await dependencies.passForSeat(claims);
    // `passForSeat` already refuses a non-paid, refunded or cancelled seat, so a
    // seat that arrives here is admissible; the two states left are which side
    // of the check-in it is on.
    if (!seat) return null;
    return {state: seat.checkedInAt ? "already_checked_in" : "ready", seat};
  };
}

export function loadCheckIn(token: string, dependencies: CheckInPageDependencies = {
  verify: (value) => verifyPassToken(value, ticketPassEnv().ticketPassTokenSecret),
  passForSeat: (claims) => ticketCheckInRepository.passForSeat(claims),
}): Promise<CheckInPageData | null> {
  return createCheckInLoader(dependencies)(token);
}
