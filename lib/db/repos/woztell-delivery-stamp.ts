import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {messages} from "@/lib/db/server-schema";

/**
 * S-14 / boundary 10. A capability actor, the way
 * `lib/db/repos/woztell-inbound-events.ts` does it — deliberately NOT the
 * actorless shape of `lib/db/repos/woztell.ts` and
 * `lib/db/repos/woztell-delivery-outbox.ts`, which predate the §9 rule and are
 * the two standing exceptions rather than the precedent.
 *
 * A DIFFERENT `unique symbol` from `woztellWebhookActor`, and that is the whole
 * point of minting one per entry point: this writer is driven from the reply
 * path, so nothing that holds the webhook's capability can reach it and nothing
 * that holds this one can reach the webhook's staff-task writers.
 */
const woztellDeliveryCapability: unique symbol = Symbol("woztell-delivery-capability");

export type WoztellDeliveryActor = Readonly<{
  kind: "woztell-delivery";
  userId: null;
  [woztellDeliveryCapability]: true;
}>;

export function woztellDeliveryActor(): WoztellDeliveryActor {
  return Object.freeze({
    kind: "woztell-delivery",
    userId: null,
    [woztellDeliveryCapability]: true as const,
  });
}

function requireWoztellDelivery(actor: unknown): asserts actor is WoztellDeliveryActor {
  const candidate = actor as Partial<WoztellDeliveryActor> | null;
  if (
    !candidate
    || candidate.kind !== "woztell-delivery"
    || candidate[woztellDeliveryCapability] !== true
  ) {
    throw new Error("FORBIDDEN");
  }
}

export type ConciergeDeliveryStamp = Readonly<{
  /** The INBOUND row the jsonb outbox reserved against — the thread's key. */
  inboundProviderMessageId: string;
  /** The id the send API returned for the reply that just left. */
  providerId: string;
}>;

export type ConciergeDeliveryStampResult = Readonly<{stamped: boolean}>;

const stampSchema = z.object({
  inboundProviderMessageId: z.string().trim().min(1).max(300),
  providerId: z.string().trim().min(1).max(300),
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

/** 23505, however deeply the driver has wrapped it — the shape `inbox.ts` uses. */
function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {code?: unknown; cause?: unknown};
  return candidate.code === "23505" || uniqueViolation(candidate.cause);
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

/**
 * The concierge's own reply had no `provider_message_id` on it until this
 * existed: `lib/ai/agents/concierge.ts` appends the assistant row with none, and
 * the id the send API returns was written only into the INBOUND row's
 * `metadata.woztellSessionDelivery.providerId`. So
 * `woztellInboundEvents.recordDeliveryStatus` — which reaches a row BY its
 * provider id — matched zero rows for every bot reply, the inbox showed no tick
 * for the concierge, and C-9 would have read that as a provider problem.
 *
 * S-5 draws the line this module must not cross: `woztell-delivery-outbox.ts` is
 * the *reservation* keyed on the inbound row, it decides whether the concierge
 * may send, and four integration tests pin it. This is a stamp applied AFTER
 * that decision, on the OUTBOUND row, and it is never a second decision — which
 * is why the caller runs it inside a `.catch()` and why nothing here throws on a
 * miss.
 */
export function createWoztellDeliveryStampRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async stampConciergeDelivery(
      actor: unknown,
      input: ConciergeDeliveryStamp,
    ): Promise<ConciergeDeliveryStampResult> {
      requireWoztellDelivery(actor);
      const parsed = stampSchema.parse(input);
      const database = await loadDatabase();

      // The outbox keys on the inbound row, so that is the only handle the
      // delivery path holds. One hop to the thread, then one guarded UPDATE.
      const inbound = rowsFrom(await database.execute(sql`
        SELECT ${messages.conversationId} AS conversation_id
        FROM ${messages}
        WHERE ${messages.providerMessageId} = ${parsed.inboundProviderMessageId}
          AND ${messages.direction} = 'inbound'
        LIMIT 1
      `))[0];
      // Not an error: a reply whose inbound row we cannot find is a reply we
      // cannot attribute, and an escalation over bookkeeping would be worse than
      // a missing tick.
      if (!inbound) return {stamped: false};
      const conversationId = String(inbound.conversation_id);

      try {
        const stamped = rowsFrom(await database.execute(sql`
          UPDATE ${messages}
          SET delivery_status = 'sent', provider_message_id = ${parsed.providerId}
          WHERE ${messages.id} = (
            SELECT candidate.id
            FROM ${messages} AS candidate
            WHERE candidate.conversation_id = ${conversationId}
              -- A thread can carry web-widget replies as well: they are outbound
              -- and carry no delivery state either, and stamping one with a
              -- WhatsApp provider id would point every later tick at a message
              -- WhatsApp never carried.
              AND candidate.channel = 'whatsapp'
              AND candidate.direction = 'outbound'
              -- NULL is "no delivery state yet", which is the concierge's own
              -- row and nothing else: a staff reply is 'queued' from the moment
              -- it is written (S-8) and an echo-inserted row is already 'sent'.
              AND candidate.delivery_status IS NULL
              AND candidate.provider_message_id IS NULL
            ORDER BY candidate.created_at DESC
            LIMIT 1
            -- Two inbound messages answered in the same thread at the same
            -- moment must not both stamp the same row; SKIP LOCKED sends the
            -- second one to the next candidate, as the echo's adoption does.
            FOR UPDATE SKIP LOCKED
          )
            -- Idempotency, and it is not tidiness. On a second call for the same
            -- provider id the row stamped first no longer qualifies above — it
            -- has an id now — so without this guard the statement would walk on
            -- to the NEXT unstamped bot reply in the thread and give it an id it
            -- was never sent with. In production the partial unique index would
            -- catch that as a 23505; this makes it a no-op instead of a swallow.
            AND NOT EXISTS (
              SELECT 1 FROM ${messages} AS stamped_already
              WHERE stamped_already.provider_message_id = ${parsed.providerId}
            )
          RETURNING ${messages.id} AS id
        `))[0];
        return {stamped: Boolean(stamped)};
      } catch (error) {
        // The outbound echo got here first and already adopted the id. The
        // message went out; only the bookkeeping raced.
        if (!uniqueViolation(error)) throw error;
        return {stamped: false};
      }
    },
  };
}

export type WoztellDeliveryStampRepository =
  ReturnType<typeof createWoztellDeliveryStampRepository>;
