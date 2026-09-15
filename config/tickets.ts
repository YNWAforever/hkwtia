/** The most seats one order may buy; a policy cap, not a technical limit. */
export const MAX_TICKET_SEATS = 10;
/** How long a pending order holds its seats -- the Stripe session's own expiry. */
export const TICKET_HOLD_MS = 30 * 60_000;
