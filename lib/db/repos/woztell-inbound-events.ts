import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  auditEvents,
  contacts,
  conversations,
  messages,
  profiles,
} from "@/lib/db/server-schema";

/**
 * S-14 / boundary 10. The route's HMAC is a gate on the ROUTE; this is the gate
 * on the REPOSITORY, and they are not the same claim. `unique symbol` means no
 * session actor, no admin actor and no plain object can be coerced into one, so
 * a second entry point cannot reach these writers by accident — the way Task
 * 11's backfill route, which has no HMAC in front of it, otherwise could.
 *
 * `lib/db/repos/woztell.ts` and `lib/db/repos/woztell-delivery-outbox.ts` take
 * no actor and authorize nothing. They predate the §9 capability-actor rule and
 * are the two standing exceptions; they are deliberately NOT the precedent for
 * anything new here.
 */
const woztellWebhookCapability: unique symbol = Symbol("woztell-webhook-capability");

export type WoztellWebhookActor = Readonly<{
  kind: "woztell-webhook";
  userId: null;
  [woztellWebhookCapability]: true;
}>;

export function woztellWebhookActor(): WoztellWebhookActor {
  return Object.freeze({
    kind: "woztell-webhook",
    userId: null,
    [woztellWebhookCapability]: true as const,
  });
}

function requireWoztellWebhook(actor: unknown): asserts actor is WoztellWebhookActor {
  const candidate = actor as Partial<WoztellWebhookActor> | null;
  if (
    !candidate
    || candidate.kind !== "woztell-webhook"
    || candidate[woztellWebhookCapability] !== true
  ) {
    throw new Error("FORBIDDEN");
  }
}

export type DeliveryStatusEvent = Readonly<{
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: string | null;
  occurredAt: Date;
}>;

export type OutboundEchoEvent = Readonly<{
  /** Normalised E.164; the processor normalises before calling. */
  recipient: string;
  text: string;
  providerMessageId: string;
  origin: "BOT" | "MANUAL" | "RELAY";
  sentAt: Date;
}>;

export type DeliveryStatusResult = Readonly<{
  matched: boolean;
  /**
   * `target` exists so C2 Task 10 can extend the miss case to
   * `campaign_recipients` — a campaign send writes its provider id there and
   * creates no `messages` row at all — without changing this signature again.
   * C1 only ever returns "message" | null.
   */
  target: "message" | null;
}>;

export type OutboundEchoResult = Readonly<{
  disposition: "adopted" | "inserted" | "duplicate";
}>;

const deliveryStatusSchema = z.object({
  providerMessageId: z.string().trim().min(1).max(300),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  errorCode: z.string().trim().min(1).max(200).nullable(),
  occurredAt: z.coerce.date(),
}).strict();

const outboundEchoSchema = z.object({
  recipient: z.string().regex(/^\+\d{8,15}$/),
  text: z.string().min(1).max(20_000),
  providerMessageId: z.string().trim().min(1).max(300),
  origin: z.enum(["BOT", "MANUAL", "RELAY"]),
  sentAt: z.coerce.date(),
}).strict();

type Row = Record<string, unknown>;

function rowsFrom(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Row[];
  }
  return [];
}

/**
 * The tick order, as a fresh fragment each time: a delivery status may only ever
 * move forward. Reusing one `SQL` object in two slots of the same statement
 * would work, but a fragment builder makes that a non-question.
 *
 * A row whose `delivery_status` is NULL never matches, because
 * `array_position(…, NULL)` is NULL and NULL < anything is unknown. That is
 * deliberate: NULL means "this message has no delivery state", which is every
 * inbound row and every web row — not a message we sent and are awaiting ticks
 * for. Task 10 stamps the concierge's own replies so they leave NULL behind.
 */
function deliveryOrder() {
  return sql`ARRAY['queued','sent','delivered','read','failed']`;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

/**
 * `now` comes first so the production wiring can pass its own clock the way it
 * does to `createPostgresWoztellStore`; the loader is second and injectable so
 * the authorization tests can prove each method refuses a forged actor *before*
 * the database is opened.
 */
export function createWoztellInboundEventsRepository(
  now: () => Date = () => new Date(),
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    /**
     * One statement, no transaction, and no throw on a miss: a miss is the
     * expected result for every message sent before this release, and for every
     * concierge reply until Task 10 stamps them. Throwing would make Woztell
     * retry a status event forever for a message we simply do not have.
     */
    async recordDeliveryStatus(
      actor: unknown,
      event: DeliveryStatusEvent,
    ): Promise<DeliveryStatusResult> {
      requireWoztellWebhook(actor);
      const parsed = deliveryStatusSchema.parse(event);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${messages}
        SET
          delivery_status = ${parsed.status}::message_delivery_status,
          -- Every bind parameter compared against a bare literal carries an
          -- explicit ::text. A bind parameter tested against a literal gives
          -- Postgres two unknowns and nothing to infer an operator from, which
          -- is the 42P18 shape agent-runs.ts and approvals.ts already hit.
          error_code = CASE
            WHEN ${parsed.status}::text = 'failed' THEN ${parsed.errorCode}
            ELSE ${messages.errorCode}
          END,
          delivered_at = CASE
            WHEN ${parsed.status}::text IN ('delivered', 'read')
              THEN COALESCE(${messages.deliveredAt}, ${parsed.occurredAt})
            ELSE ${messages.deliveredAt}
          END,
          read_at = CASE
            WHEN ${parsed.status}::text = 'read'
              THEN COALESCE(${messages.readAt}, ${parsed.occurredAt})
            ELSE ${messages.readAt}
          END
        WHERE ${messages.providerMessageId} = ${parsed.providerMessageId}
          AND ${messages.direction} = 'outbound'
          -- Never walk a tick backwards: a late 'sent' must not undo a 'read'.
          AND array_position(${deliveryOrder()}, ${messages.deliveryStatus}::text)
              < array_position(${deliveryOrder()}, ${parsed.status}::text)
        RETURNING ${messages.id} AS id
      `))[0];
      return row
        ? {matched: true, target: "message"}
        : {matched: false, target: null};
    },

    /**
     * An echo is Woztell telling us a message left the building — possibly one
     * we queued (adopt it), possibly one a person sent from the Woztell console
     * or the WhatsApp Business app (insert it, and audit it).
     */
    async recordOutboundEcho(
      actor: unknown,
      event: OutboundEchoEvent,
    ): Promise<OutboundEchoResult> {
      requireWoztellWebhook(actor);
      const parsed = outboundEchoSchema.parse(event);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${parsed.providerMessageId}, 0)
          )
        `);

        // Idempotency first. Without it a redelivered echo whose row we already
        // adopted would look like a fresh one, find a SECOND queued row with the
        // same canned content, and try to give it the same provider id — a 23505
        // on messages_provider_message_id_unique, surfaced as a 500 and retried
        // by Woztell forever.
        const known = rowsFrom(await transaction.execute(sql`
          SELECT ${messages.id} AS id
          FROM ${messages}
          WHERE ${messages.providerMessageId} = ${parsed.providerMessageId}
          LIMIT 1
        `))[0];
        if (known) return {disposition: "duplicate"};

        // Resolve the conversation once, at the top: both the adopt and the
        // insert are bound to it.
        //
        // D-6 keeps the HMAC of the sender's number as the conversation owner
        // key, and the HMAC secret lives in the wiring layer, not here — so this
        // resolves through the three CLEARTEXT links a recipient number has to a
        // thread instead: the contact link, the member's own WhatsApp number,
        // and the normalised sender the inbound claim records in message
        // metadata. Each EXISTS spells out its own parentheses, because
        // drizzle's `exists()` helper does not parenthesise a raw fragment and
        // the resulting `EXISTS SELECT …` is a syntax error every text-level
        // assertion in this repo renders as happily as the working form.
        const digits = parsed.recipient.replace(/\D/g, "");
        const conversation = rowsFrom(await transaction.execute(sql`
          SELECT ${conversations.id} AS id
          FROM ${conversations}
          WHERE ${conversations.channel} = 'whatsapp'
            AND ${conversations.status} = 'active'
            AND (
              EXISTS (
                SELECT 1 FROM ${contacts} AS linked_contact
                WHERE linked_contact.id = ${conversations.contactId}
                  AND linked_contact.phone_e164 = ${parsed.recipient}
              )
              OR EXISTS (
                SELECT 1 FROM ${profiles} AS owner_profile
                WHERE owner_profile.id = ${conversations.profileId}
                  AND regexp_replace(
                    COALESCE(owner_profile.whatsapp_number, ''),
                    '[^0-9]',
                    '',
                    'g'
                  ) = ${digits}
              )
              OR EXISTS (
                SELECT 1 FROM ${messages} AS prior_message
                WHERE prior_message.conversation_id = ${conversations.id}
                  AND prior_message.metadata->>'normalizedSender' = ${parsed.recipient}
              )
            )
          ORDER BY ${conversations.lastMessageAt} DESC NULLS LAST, ${conversations.id} DESC
          LIMIT 1
          FOR UPDATE
        `))[0];
        // An echo is not a reason to open a thread: without an inbound there is
        // no owner key, no window and nothing for the inbox to show.
        if (!conversation) return {disposition: "duplicate"};
        const conversationId = String(conversation.id);

        // Adopt, bounded to THAT conversation. An inbox runs on canned replies:
        // two staff answering "Thanks — someone will come back to you shortly."
        // to two different prospects produce two queued rows with byte-identical
        // content. Bounding the match to *a* WhatsApp conversation rather than
        // *the* one lets prospect A's echo adopt prospect B's row — B's row takes
        // A's provider id and flips to 'sent' though B's send may not have
        // happened, and every later tick for A lands on B's thread. That is
        // delivery state leaking between two contacts.
        //
        // Content equality is the join because the echo cannot carry our
        // `outbound_key`; without adoption, an echo that beats our own send's
        // HTTP response leaves two rows for one message.
        const adopted = rowsFrom(await transaction.execute(sql`
          UPDATE ${messages}
          SET provider_message_id = ${parsed.providerMessageId}, delivery_status = 'sent'
          WHERE ${messages.id} = (
            SELECT candidate.id FROM ${messages} AS candidate
            WHERE candidate.conversation_id = ${conversationId}
              AND candidate.direction = 'outbound'
              AND candidate.delivery_status = 'queued'
              AND candidate.provider_message_id IS NULL
              AND candidate.content = ${parsed.text}
            ORDER BY candidate.created_at DESC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING ${messages.id} AS id
        `))[0];
        if (adopted) {
          await bumpConversation(transaction, conversationId, parsed.sentAt, now());
          // No audit row: an adopted row is one WE queued, and Task 6 wrote its
          // `conversation.reply.queued` row in the same transaction as the
          // write-ahead insert (S-7). A second row would be noise.
          return {disposition: "adopted"};
        }

        // MANUAL is a person replying from the Woztell console or the WhatsApp
        // Business app — the expected path during C-9 bring-up and any time the
        // inbox is down. Storing all three origins as 'assistant' would put that
        // reply in the transcript under "Concierge", attributed to a bot that did
        // not send it, with no audit row anywhere.
        const role = parsed.origin === "BOT" ? "assistant" : "staff";
        const inserted = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messages}
            (
              conversation_id,
              role,
              channel,
              direction,
              delivery_status,
              content,
              provider_message_id,
              metadata,
              citations,
              created_at
            )
          VALUES (
            ${conversationId},
            ${role},
            'whatsapp',
            'outbound',
            'sent',
            ${parsed.text},
            ${parsed.providerMessageId},
            ${JSON.stringify({echoOrigin: parsed.origin})}::jsonb,
            '[]'::jsonb,
            ${parsed.sentAt}
          )
          ON CONFLICT (provider_message_id)
            WHERE provider_message_id IS NOT NULL
          DO NOTHING
          RETURNING ${messages.id} AS id
        `))[0];
        if (!inserted) return {disposition: "duplicate"};
        const messageId = String(inserted.id);

        if (parsed.origin !== "BOT") {
          // actor_user_id is NULL on purpose: we know a person sent this, and we
          // cannot know which one. The concierge's own send needs no row here —
          // its agent_run already accounts for it.
          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, metadata)
            VALUES (
              NULL,
              'woztell-webhook',
              'conversation.reply.external',
              'message',
              ${messageId},
              ${JSON.stringify({
                origin: parsed.origin,
                providerMessageId: parsed.providerMessageId,
                conversationId,
              })}::jsonb
            )
          `);
        }

        await bumpConversation(transaction, conversationId, parsed.sentAt, now());
        return {disposition: "inserted"};
      });
    },
  };
}

/**
 * `last_message_at` is the domain timestamp — when the message left — and drives
 * the inbox ordering. `updated_at` is row maintenance: when we learned of it.
 * Deliberately does NOT touch `last_inbound_at`: an outbound echo must never
 * reopen the 24-hour customer-service window.
 */
async function bumpConversation(
  transaction: Pick<AutomationDatabase, "execute">,
  conversationId: string,
  sentAt: Date,
  observedAt: Date,
): Promise<void> {
  await transaction.execute(sql`
    UPDATE ${conversations}
    SET
      last_message_at = GREATEST(COALESCE(last_message_at, ${sentAt}), ${sentAt}),
      updated_at = GREATEST(updated_at, ${observedAt})
    WHERE ${conversations.id} = ${conversationId}
  `);
}

export type WoztellInboundEventsRepository =
  ReturnType<typeof createWoztellInboundEventsRepository>;
