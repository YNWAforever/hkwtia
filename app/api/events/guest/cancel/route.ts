import {unsubscribeEnv} from "@/lib/config/env";
import {contactWriterActor} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {cancelDigestFromToken} from "@/lib/events/guest-registration-core";
import type {AppLocale} from "@/i18n/routing";
import {readBoundedText} from "@/lib/security/bounded-body";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

function localeOf(value: string | null): AppLocale {
  return value === "zh-HK" ? "zh-HK" : "en";
}

function redirect(request: Request, locale: AppLocale, pathname: string): Response {
  const location = new URL(localizedPath(locale, pathname), request.url);
  return new Response(null, {status: 303, headers: {location: location.toString(), "cache-control": "no-store"}});
}

/** Email links open a confirmation page; crawlers and mail previews cannot cancel a registration. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = localeOf(url.searchParams.get("locale"));
  const token = url.searchParams.get("token") ?? "";
  if (!cancelDigestFromToken(unsubscribeEnv().unsubscribeTokenSecret, token)) {
    return redirect(request, locale, "/events?guest=invalid");
  }
  const target = new URL(localizedPath(locale, "/events/guest-cancel"), request.url);
  target.searchParams.set("token", token);
  return new Response(null, {status: 303, headers: {location: target.toString(), "cache-control": "no-store"}});
}

/** A deliberate form submit spends the single-purpose cancellation capability. */
export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response(null, {status: 415});
  }
  let body: string;
  try {
    body = await readBoundedText(request, 512);
  } catch {
    return new Response(null, {status: 413});
  }
  const form = new URLSearchParams(body);
  const locale = localeOf(form.get("locale"));
  const digest = cancelDigestFromToken(unsubscribeEnv().unsubscribeTokenSecret, form.get("token") ?? "");
  if (!digest) return redirect(request, locale, "/events?guest=invalid");
  try {
    const outcome = await eventGuestsRepository.cancelByToken(contactWriterActor("event_guest"), digest);
    return redirect(request, locale, "/events?guest=" + outcome);
  } catch (error) {
    console.error("guest-cancel", error);
    // Keep the signed token on the confirmation page so a transient database
    // failure does not masquerade as an invalid link or strand the guest.
    const target = new URL(localizedPath(locale, "/events/guest-cancel"), request.url);
    target.searchParams.set("token", form.get("token") ?? "");
    target.searchParams.set("error", "unavailable");
    return new Response(null, {status: 303, headers: {location: target.toString(), "cache-control": "no-store"}});
  }
}
