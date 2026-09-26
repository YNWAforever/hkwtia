import {TICKET_RECOVERY_MS} from "@/config/tickets";

export const TICKET_RECOVERY_COOKIE = "hkwtia_ticket_checkout_recovery";
export type TicketRecoveryCookie = Readonly<{eventId: string; idempotencyKey: string; token: string}>;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COOKIE_PATTERN = new RegExp(String.raw`^v1\.(${UUID})\.(${UUID})\.([A-Za-z0-9_-]{43})$`, "i");
export function parseTicketRecoveryCookie(value: string | undefined): TicketRecoveryCookie | null {
  const match = value ? COOKIE_PATTERN.exec(value) : null;
  return match ? {eventId: match[1], idempotencyKey: match[2], token: match[3]} : null;
}
export function ticketRecoveryCookieValue(input: TicketRecoveryCookie): string {
  return `v1.${input.eventId}.${input.idempotencyKey}.${input.token}`;
}
export function ticketRecoveryCookieOptions() {
  return {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
    path: "/", maxAge: Math.ceil(TICKET_RECOVERY_MS / 1000)};
}
