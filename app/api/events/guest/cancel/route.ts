import {unsubscribeEnv} from "@/lib/config/env";
import {contactWriterActor} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {cancelTokenDigest} from "@/lib/events/guest-registration-core";

export const dynamic = "force-dynamic";

/**
 * One-click cancel from the guest confirmation email (programme B-4). GET so the
 * link works from any mail client; the token is single-purpose, unguessable and
 * stored only as an HMAC digest, so it authorises exactly this one row and
 * nothing else. Every outcome lands on /events with a status the page renders.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{32}$/.test(token)) return Response.redirect(new URL("/events?guest=invalid", request.url), 303);
  const outcome = await eventGuestsRepository
    .cancelByToken(contactWriterActor("event_guest"), cancelTokenDigest(unsubscribeEnv().unsubscribeTokenSecret, token))
    .catch((error: unknown) => {
      // The guest only ever sees `unknown`; the failure itself must reach the logs.
      console.error("guest-cancel", error);
      return "unknown" as const;
    });
  return Response.redirect(new URL(`/events?guest=${outcome}`, request.url), 303);
}
