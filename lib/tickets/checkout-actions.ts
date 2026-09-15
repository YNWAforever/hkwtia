"use server";

import {headers} from "next/headers";
import {z} from "zod";

import {MAX_TICKET_SEATS} from "@/config/tickets";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {createTicketCheckout} from "@/lib/tickets/checkout-core";

// Process-local, the guest RSVP's numbers: a bot cannot complete a payment, but
// it can create pending orders, and this bounds that.
const ticketRateLimiter = createInMemoryRateLimiter({limit: 5, windowMs: 15 * 60_000});

const seatSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
}).strict();

const ticketFormSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(200),
  buyerEmail: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
  locale: z.enum(["en", "zh-HK"]),
  seats: z.array(seatSchema).min(1).max(MAX_TICKET_SEATS),
}).strict();

export type TicketCheckoutState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "ignored"}>
  | Readonly<{status: "error"; code: string}>;

/** The attendee rows the form rendered, in order, skipping any it left blank. */
function seatsFromFormData(formData: FormData): readonly {name: string; email: string}[] {
  const seats: {name: string; email: string}[] = [];
  for (let index = 0; index < MAX_TICKET_SEATS; index += 1) {
    const name = String(formData.get(`seatName-${index}`) ?? "").trim();
    const email = String(formData.get(`seatEmail-${index}`) ?? "").trim();
    if (!name && !email) continue;
    seats.push({name, email});
  }
  return seats;
}

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
  if (!ticketRateLimiter.check(clientIpFromHeaders(await headers()) ?? "").allowed) {
    return {status: "error", code: "RATE_LIMITED"};
  }

  const parsed = ticketFormSchema.safeParse({
    eventId: formData.get("eventId"),
    idempotencyKey: formData.get("idempotencyKey"),
    buyerName: formData.get("buyerName"),
    buyerEmail: formData.get("buyerEmail"),
    locale: formData.get("locale"),
    seats: seatsFromFormData(formData),
  });
  if (!parsed.success) return {status: "error", code: "INVALID"};

  const actor = await getActor();
  const result = await createTicketCheckout({
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
  return result.status === "redirect" ? {status: "redirect", url: result.url} : {status: "error", code: result.code};
}
