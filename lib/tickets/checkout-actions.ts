"use server";

import {cookies, headers} from "next/headers";
import {redirect} from "next/navigation";
import {z} from "zod";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import {createSharedRateLimiter} from "@/lib/security/shared-rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {createTicketCheckout} from "@/lib/tickets/checkout-core";
import {eventCheckoutRecoveriesRepository} from "@/lib/db/repos/event-checkout-recoveries";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {newRecoveryToken, readTicketRecovery, recoveryDigest, resumeTicketRecovery, type TicketRecoverySummary} from "@/lib/tickets/checkout-recovery";
import {parseTicketRecoveryCookie, ticketRecoveryCookieOptions, ticketRecoveryCookieValue, TICKET_RECOVERY_COOKIE} from "@/lib/tickets/recovery-cookie";
import {parseTicketCheckoutForm, type TicketCheckoutFormResult} from "@/lib/tickets/checkout-input";

export type TicketCheckoutState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "ignored"}>
  | Readonly<{status: "pending"; summary: TicketRecoverySummary}>
  | Readonly<{status: "error"; code: string; fieldErrors?: Extract<TicketCheckoutFormResult, {ok: false}>["fieldErrors"]}>;

/**
 * The public buyer boundary. Only this wrapper is exported; it resolves its own
 * actor, so a signed-in member is linked to the order and an anonymous visitor
 * buys as a guest.
 *
 * `useActionState` passes the previous state first, so the signature is
 * `(previous, formData)` even though the previous value is unused.
 */
export async function submitTicketCheckoutAction(_previous: TicketCheckoutState, formData: FormData): Promise<TicketCheckoutState> {
  if (String(formData.get("website") ?? "").length > 0) return {status: "ignored"};
  // `clientIpFromHeaders` returns null when no trusted proxy header is present;
  // the limiter refuses an empty key, which is the fail-closed direction for a
  // payment boundary and matches the limiter's own `!key` guard.
  const clientIp = clientIpFromHeaders(await headers());
  if (!clientIp) return {status: "error", code: "RATE_LIMITED"};
  try {
    const limiter = createSharedRateLimiter("ticket-checkout", process.env.RATE_LIMIT_KEY_SECRET ?? "");
    if (!(await limiter.check("ip:" + clientIp)).allowed) return {status: "error", code: "RATE_LIMITED"};
  } catch {
    // A missing digest secret or shared-store outage cannot allow an unbounded payable attempt.
    return {status: "error", code: "UNAVAILABLE"};
  }

  const parsed = parseTicketCheckoutForm(formData);
  if (!parsed.ok) return {status: "error", code: "INVALID", fieldErrors: parsed.fieldErrors};

  // A failed session read can still use the public guest path. The locked
  // repository rejects private events unless a member actor is verified.
  const actor = await getActor().catch(() => null);
  const resolvedActor = actor ?? ANONYMOUS_ACTOR;
  const jar = await cookies();
  const prior = parseTicketRecoveryCookie(jar.get(TICKET_RECOVERY_COOKIE)?.value);
  if (jar.get(TICKET_RECOVERY_COOKIE) && !prior) return {status: "error", code: "UNAVAILABLE"};
  if (prior) {
    let summary: TicketRecoverySummary | null;
    try {
      summary = await readTicketRecovery({token: prior.token, eventId: prior.eventId, actor: resolvedActor},
        {store: eventCheckoutRecoveriesRepository, now: () => new Date()});
    } catch { return {status: "error", code: "UNAVAILABLE"}; }
    if (summary) {
      if (summary.status === "pending") return summary.eventId === parsed.data.eventId
        ? {status: "pending", summary} : {status: "error", code: "UNAVAILABLE"};
      return {status: "error", code: summary.status === "paid" ? "ALREADY_COMPLETED" : "RETRY_EXPIRED"};
    }
    // A row can exist but be invisible because its member owner differs. That
    // must block this browser from minting a new payable order with the same key.
    try {
      if (await eventCheckoutRecoveriesRepository.read(recoveryDigest(prior.token), new Date())) {
        return {status: "error", code: "UNAVAILABLE"};
      }
    } catch { return {status: "error", code: "UNAVAILABLE"}; }
    // A provisional cookie can be retried only with its original attempt key.
    // After reload the new mount has a new key, so an uncertain old attempt
    // cannot silently create a second payable session.
    if (prior.eventId !== parsed.data.eventId || prior.idempotencyKey !== parsed.data.idempotencyKey) {
      return {status: "error", code: "UNAVAILABLE"};
    }
  }
  const capability = prior ?? {eventId: parsed.data.eventId, idempotencyKey: parsed.data.idempotencyKey, token: newRecoveryToken()};
  if (!prior) jar.set(TICKET_RECOVERY_COOKIE, ticketRecoveryCookieValue(capability), ticketRecoveryCookieOptions());
  let result;
  try {
    result = await createTicketCheckout({
    actor: resolvedActor,
    eventId: parsed.data.eventId,
    buyer: {
      profileId: actor?.kind === "member" ? actor.profileId : null,
      name: parsed.data.buyerName,
      email: parsed.data.buyerEmail,
    },
    seats: parsed.data.seats,
    idempotencyKey: parsed.data.idempotencyKey,
    locale: parsed.data.locale as AppLocale,
    });
  } catch { return {status: "error", code: "UNAVAILABLE"}; }
  if (result.status !== "redirect" && result.code !== "UNAVAILABLE") {
    if (!prior) jar.delete(TICKET_RECOVERY_COOKIE);
    return {status: "error", code: result.code};
  }
  try {
    const issued = await eventCheckoutRecoveriesRepository.issueForAttempt({
      digest: recoveryDigest(capability.token), eventId: parsed.data.eventId,
      idempotencyKey: parsed.data.idempotencyKey,
      buyerProfileId: actor?.kind === "member" ? actor.profileId : null, now: new Date(),
    });
    if (!issued) return {status: "error", code: "UNAVAILABLE"};
  } catch { return {status: "error", code: "UNAVAILABLE"}; }
  if (result.status === "redirect") redirect(result.url);
  return {status: "error", code: result.code};
}

export async function resumeTicketCheckoutAction(_previous: TicketCheckoutState, formData: FormData): Promise<TicketCheckoutState> {
  const eventId = z.string().uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return {status: "error", code: "INVALID"};
  const jar = await cookies();
  const capability = parseTicketRecoveryCookie(jar.get(TICKET_RECOVERY_COOKIE)?.value);
  if (!capability || capability.eventId !== eventId.data) return {status: "error", code: "UNAVAILABLE"};
  const actor = await getActor().catch(() => null);
  try {
    const result = await resumeTicketRecovery({token: capability.token, eventId: eventId.data,
      actor: actor ?? ANONYMOUS_ACTOR}, {
      store: eventCheckoutRecoveriesRepository, stripe: stripeBillingAdapter(), orders: eventOrdersRepository,
      now: () => new Date(),
    });
    if (result.status === "error" && result.code === "RETRY_EXPIRED") jar.delete(TICKET_RECOVERY_COOKIE);
    if (result.status === "redirect") return result;
    return {status: "error", code: result.code === "NOT_FOUND" ? "UNAVAILABLE" : result.code};
  } catch { return {status: "error", code: "UNAVAILABLE"}; }
}
