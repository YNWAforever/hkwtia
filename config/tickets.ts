/** The most seats one order may buy; a policy cap, not a technical limit. */
export const MAX_TICKET_SEATS = 10;
/** How long a pending order holds its seats. */
export const TICKET_HOLD_MS = 30 * 60_000;
/**
 * The expiry handed to Stripe, which must be at least 30 minutes after the
 * session is CREATED. The hold is computed before the order write and the
 * network call, so passing `TICKET_HOLD_MS` verbatim is a rejection by a few
 * seconds of latency. Stripe's lower bound plus slack.
 */
export const TICKET_SESSION_MIN_MS = TICKET_HOLD_MS + 5 * 60_000;
