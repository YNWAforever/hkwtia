/**
 * The bounds on the provider-supplied strings that cross the Woztell webhook.
 *
 * C-1 review. These four numbers already existed, as `.max(…)` arguments inside
 * `lib/db/repos/contacts.ts` and `lib/db/repos/woztell-inbound-events.ts`. That
 * is a fine place to enforce a bound and a terrible place to *own* one: a zod
 * bound throws, `lib/api/woztell-webhook-route.ts` turns any throw into a 500,
 * and Woztell retries a 500 — so a provider that sent one over-long id put that
 * sender into a permanent retry loop. The message never persisted, never reached
 * staff, and the route burned an invocation on every redelivery.
 *
 * So the numbers move here, where the normaliser (`lib/channels/woztell.ts`) can
 * apply them BEFORE anything can throw on them, and the repositories keep
 * enforcing exactly the same values. That is the whole safety argument and it
 * only holds while there is one copy of each number: a repository bound that
 * drifted below the normaliser's clamp would silently reopen the loop, and one
 * that drifted above it would quietly widen what we store. Both ends are pinned
 * by `tests/integration/woztell-hostile-provider-field.test.ts`, which retypes
 * these numbers on purpose rather than importing them.
 *
 * Nothing here is a guess about the provider (plan O-1 covers what is). They are
 * generous multiples of the real shapes: a WhatsApp `wamid` is around 60
 * characters and a WhatsApp text body is capped at 4096 by WhatsApp itself.
 */

/**
 * `messages.provider_message_id` and every idempotency probe that reads it.
 * REJECT past this, never truncate — see `normalizedInbound`: it is a key, and a
 * truncated key belongs to a different message.
 */
export const WOZTELL_MAX_PROVIDER_MESSAGE_ID_CHARS = 300;

/**
 * `contacts.whatsapp_member_id` / `conversations.whatsapp_member_id`. DROPPED to
 * absent past this: it is an optional adornment on an otherwise good message,
 * and `contacts_whatsapp_member_unique` plus first-identity-wins linking makes a
 * truncated id a permanent link to the wrong member.
 */
export const WOZTELL_MAX_MEMBER_ID_CHARS = 200;

/**
 * `messages.error_code` on a delivery tick. TRUNCATED past this, because the
 * alternative is discarding the tick — and the error code rides on the `failed`
 * tick, so a reject rule would discard precisely the failures staff need to see.
 */
export const WOZTELL_MAX_ERROR_CODE_CHARS = 200;

/**
 * The body of an outbound echo. REJECTED past this: the echo's adopt statement
 * joins on message content, so a truncated body cannot match the row it belongs
 * to and would insert a duplicate instead — and a shortened body in a transcript
 * is a falsified record staff reply from.
 */
export const WOZTELL_MAX_ECHO_TEXT_CHARS = 20_000;
