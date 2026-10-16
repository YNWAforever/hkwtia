import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";

import {getActor} from "@/lib/auth/actor";
import {eventCheckoutRecoveriesRepository} from "@/lib/db/repos/event-checkout-recoveries";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {isProviderExpiredTicketRecovery, readTicketRecovery} from "@/lib/tickets/checkout-recovery";
import {parseTicketRecoveryCookie, TICKET_RECOVERY_COOKIE} from "@/lib/tickets/recovery-cookie";

export const dynamic = "force-dynamic";
const privateHeaders = {"Cache-Control": "private, no-store"};
const notFound = () => NextResponse.json({status: "unavailable"}, {status: 404, headers: privateHeaders});

/** A capability read: no raw token, Stripe URL, attendee PII, or idempotency key leaves this route. */
export async function GET(request: NextRequest) {
  const eventId = z.string().uuid().safeParse(request.nextUrl.searchParams.get("eventId"));
  const capability = parseTicketRecoveryCookie(request.cookies.get(TICKET_RECOVERY_COOKIE)?.value);
  if (!eventId.success || !capability) return notFound();
  const actor = await getActor().catch(() => null);
  try {
    const summary = await readTicketRecovery({token: capability.token, eventId: capability.eventId,
      actor: actor ?? ANONYMOUS_ACTOR}, {store: eventCheckoutRecoveriesRepository, now: () => new Date()});
    // A provider-confirmed expired order cannot be resumed. Clear only the
    // actor-authorized capability, allowing this browser to start a new attempt.
    // Reading the cookie's original event also recovers a move to another event.
    // Pending, paid and uncertain refund outcomes retain their capability.
    if (summary?.status === "expired" && await isProviderExpiredTicketRecovery({
      token: capability.token, eventId: capability.eventId, actor: actor ?? ANONYMOUS_ACTOR,
    }, {store: eventCheckoutRecoveriesRepository, now: () => new Date(), stripe: stripeBillingAdapter()})) {
      const response = notFound();
      response.cookies.delete(TICKET_RECOVERY_COOKIE);
      return response;
    }
    if (capability.eventId !== eventId.data) return notFound();
    return summary ? NextResponse.json(summary, {headers: privateHeaders}) : notFound();
  } catch {
    return NextResponse.json({status: "unavailable"}, {status: 503, headers: privateHeaders});
  }
}
