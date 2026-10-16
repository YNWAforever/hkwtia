import "server-only";

import {ticketPassEnv} from "@/lib/config/env";
import {ticketCheckInRepository, type PassSeatResult, type PassView} from "@/lib/db/repos/ticket-check-in";
import {verifyPassToken, type PassClaims} from "@/lib/tickets/pass-token";

export type CheckInState = "ready" | "already_checked_in";

export type CheckInPageData = Readonly<{state: CheckInState; seat: PassView}>;

export type CheckInPageDependencies = Readonly<{
  verify: (token: string) => PassClaims | null;
  passForSeat: (claims: PassClaims) => Promise<PassSeatResult>;
}>;

/**
 * Lives outside the route module because Next allows a `page.tsx` to export
 * only framework fields; the unit test drives this function directly.
 */
export function createCheckInLoader(dependencies: CheckInPageDependencies) {
  return async function loadCheckIn(token: string): Promise<CheckInPageData | null> {
    const claims = dependencies.verify(token);
    if (!claims) return null;
    const result = await dependencies.passForSeat(claims);
    // Only an `active` seat can be admitted. A cancelled event's seat resolves
    // to null here as well, so the check-in 404s and nobody is let into an
    // event that is not happening; the public pass page, not this surface, is
    // where the cancellation is explained.
    if (result.status !== "active") return null;
    const seat = result.view;
    return {state: seat.checkedInAt ? "already_checked_in" : "ready", seat};
  };
}

export function loadCheckIn(token: string, dependencies: CheckInPageDependencies = {
  verify: (value) => verifyPassToken(value, ticketPassEnv().ticketPassTokenSecret),
  passForSeat: (claims) => ticketCheckInRepository.passForSeat(claims),
}): Promise<CheckInPageData | null> {
  return createCheckInLoader(dependencies)(token);
}
