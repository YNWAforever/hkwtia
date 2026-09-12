import "server-only";

import {createHash} from "node:crypto";

import {sql} from "drizzle-orm";

import {
  decideWoztellClaimState,
  type WoztellInboundClaim,
  type WoztellInboundClaimInput,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  conversations,
  type ConversationHandling,
  messages,
  profiles,
} from "@/lib/db/server-schema";

type Row = Record<string, unknown>;

const CLAIM_LEASE_MS = 5 * 60 * 1_000;
const CONVERSATION_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

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

function metadataFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function leaseFrom(metadata: Record<string, unknown>): Date | null {
  if (typeof metadata.woztellLeaseUntil !== "string") return null;
  const date = new Date(metadata.woztellLeaseUntil);
  return Number.isFinite(date.getTime()) ? date : null;
}

function stateFrom(metadata: Record<string, unknown>) {
  if (
    metadata.woztellState === "running"
    || metadata.woztellState === "reply_ready"
    || metadata.woztellState === "completed"
  ) {
    return metadata.woztellState;
  }
  return "claimed" as const;
}

export function providerRunId(providerMessageId: string): string {
  const bytes = createHash("sha256")
    .update(providerMessageId)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The conversation state the webhook has to see alongside the claim. Read from
 * the row the claim transaction locked, never re-read afterwards: a second read
 * is a second answer, and the one it would disagree about is whether a person
 * already owns this thread.
 */
type ClaimedConversationState = Readonly<{
  handling: ConversationHandling;
  /** C-1 Task 4. Whom the human lane notifies, read from the same locked row as
   * `handling` for the same reason. */
  assignedToProfileId: string | null;
  lastInboundAt: Date | null;
}>;

function handlingFrom(value: unknown): ConversationHandling {
  return value === "human" || value === "closed" ? value : "bot";
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function conversationStateFrom(row: Row | undefined): ClaimedConversationState {
  return {
    handling: handlingFrom(row?.handling),
    assignedToProfileId: typeof row?.assigned_to_profile_id === "string"
      ? row.assigned_to_profile_id
      : null,
    lastInboundAt: dateFrom(row?.last_inbound_at),
  };
}

function acceptedClaim(
  input: WoztellInboundClaimInput,
  conversationId: string,
  state: ClaimedConversationState,
  pendingReply?: string,
): Extract<WoztellInboundClaim, {status: "accepted"}> {
  return {
    status: "accepted",
    conversationId,
    owner: input.owner,
    profileId: input.profileId,
    locale: input.locale,
    memberName: input.memberName,
    whatsappOptIn: input.whatsappOptIn,
    handling: state.handling,
    assignedToProfileId: state.assignedToProfileId,
    lastInboundAt: state.lastInboundAt,
    ...(pendingReply === undefined ? {} : {pendingReply}),
  };
}

function ownerSql(input: WoztellInboundClaimInput) {
  return input.owner.kind === "profile"
    ? sql`${conversations.profileId} = ${input.owner.profileId}
      AND ${conversations.anonymousOwnerHash} IS NULL`
    : sql`${conversations.profileId} IS NULL
      AND ${conversations.anonymousOwnerHash} = ${input.owner.anonymousOwnerHash}`;
}

function claimMetadata(
  input: WoztellInboundClaimInput,
  leaseUntil: Date,
) {
  return {
    locale: input.locale,
    normalizedSender: input.sender,
    woztellState: "claimed",
    woztellLeaseUntil: leaseUntil.toISOString(),
    woztellRunId: providerRunId(input.providerMessageId),
  };
}

/**
 * Programme C-3, plan S-14. `createPostgresWoztellStore`'s existing methods take
 * no actor and authorize nothing: they predate the §9 capability-actor rule and
 * are one of the two standing exceptions, alongside
 * `lib/db/repos/woztell-delivery-outbox.ts`. They are NOT the precedent for
 * anything new, and `importHistoricalInbound` below is new.
 *
 * The reason is concrete rather than doctrinal. Every other writer here is
 * reachable only from `/api/webhooks/woztell`, behind an HMAC. The backfill adds
 * a SECOND entry point, `/api/admin/woztell/backfill`, with **no HMAC in front
 * of it**, that reaches the same `messages` and `conversations` rows. A `unique
 * symbol` means no session actor, no admin actor and no plain object can be
 * coerced into one, so the two entry points cannot reach each other's writers by
 * accident — and this capability is deliberately DIFFERENT from
 * `woztellWebhookActor()` for the same reason: one entry point, one symbol.
 */
const woztellBackfillCapability: unique symbol = Symbol("woztell-backfill-capability");

export type WoztellBackfillActor = Readonly<{
  kind: "woztell-backfill";
  userId: null;
  [woztellBackfillCapability]: true;
}>;

export function woztellBackfillActor(): WoztellBackfillActor {
  return Object.freeze({
    kind: "woztell-backfill",
    userId: null,
    [woztellBackfillCapability]: true as const,
  });
}

function requireWoztellBackfill(
  actor: unknown,
): asserts actor is WoztellBackfillActor {
  const candidate = actor as Partial<WoztellBackfillActor> | null;
  if (
    !candidate
    || candidate.kind !== "woztell-backfill"
    || candidate[woztellBackfillCapability] !== true
  ) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * The metadata an IMPORTED row carries, and the whole reason a backfill cannot
 * become a mass re-reply. `decideWoztellClaimState` answers `"duplicate"` for
 * `state: "completed"` unconditionally (`lib/ai/woztell-webhook.ts`), so a row
 * written like this can never be claimed, never leases, never resumes and never
 * starts a concierge turn — however it is later redelivered.
 *
 * Note what is absent: no `woztellLeaseUntil` and no `woztellRunId`. Those two
 * fields are what make a row resumable, and `claimInbound`'s `claimMetadata`
 * writes both.
 */
function importMetadata(input: WoztellInboundClaimInput) {
  return {
    locale: input.locale,
    normalizedSender: input.sender,
    woztellState: "completed",
  };
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createPostgresWoztellStore(
  now: () => Date = () => new Date(),
  // The loader is injectable for the same reason it is on every §9 repository:
  // `tests/unit/repository-production-security.test.ts` proves the capability
  // check refuses a forged actor BEFORE the database is opened, and a method
  // that reaches for `getDb()` itself cannot be asked that question.
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async resolveProfile(normalizedSender: string) {
      const database = await loadDatabase();
      const digits = normalizedSender.replace(/\D/g, "");
      const matches = rowsFrom(await database.execute(sql`
        SELECT
          ${profiles.id} AS id,
          ${profiles.displayName} AS display_name,
          ${profiles.locale} AS locale,
          ${profiles.whatsappOptIn} AS whatsapp_opt_in
        FROM ${profiles}
        WHERE ${profiles.whatsappOptIn} = true
          AND regexp_replace(
            COALESCE(${profiles.whatsappNumber}, ''),
            '[^0-9]',
            '',
            'g'
          ) = ${digits}
        ORDER BY ${profiles.id}
        LIMIT 2
      `));
      if (matches.length !== 1) return null;
      const row = matches[0];
      return {
        id: String(row.id),
        displayName: String(row.display_name),
        locale: row.locale === "zh-HK" ? "zh-HK" as const : "en" as const,
        whatsappOptIn: row.whatsapp_opt_in === true,
      };
    },

    async claimInbound(
      input: WoztellInboundClaimInput,
    ): Promise<WoztellInboundClaim> {
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${input.providerMessageId}, 0)
          )
        `);
        const current = now();
        const leaseUntil = new Date(current.getTime() + CLAIM_LEASE_MS);
        const existing = rowsFrom(await transaction.execute(sql`
          SELECT
            ${messages.conversationId} AS conversation_id,
            ${messages.metadata} AS metadata
          FROM ${messages}
          WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          LIMIT 1
          FOR UPDATE
        `))[0];
        if (existing) {
          const metadata = metadataFrom(existing.metadata);
          if (decideWoztellClaimState({
            state: stateFrom(metadata),
            leaseUntil: leaseFrom(metadata),
            now: current,
          }) === "duplicate") {
            return {status: "duplicate"};
          }
          // A redelivery resumes an accepted claim, so it needs the same
          // conversation state a fresh claim reports. Read after the duplicate
          // check, so the common case (Woztell retrying a message we already
          // finished) still costs nothing beyond the probe above.
          const resumedState = conversationStateFrom(rowsFrom(await transaction.execute(sql`
            SELECT
              ${conversations.handling} AS handling,
              ${conversations.assignedToProfileId} AS assigned_to_profile_id,
              ${conversations.lastInboundAt} AS last_inbound_at
            FROM ${conversations}
            WHERE ${conversations.id} = ${String(existing.conversation_id)}
            LIMIT 1
          `))[0]);
          if (
            metadata.woztellState === "reply_ready"
            && typeof metadata.woztellPendingReply === "string"
          ) {
            await transaction.execute(sql`
              UPDATE ${messages}
              SET metadata = metadata || ${JSON.stringify({
                woztellLeaseUntil: leaseUntil.toISOString(),
              })}::jsonb
              WHERE ${messages.providerMessageId} = ${input.providerMessageId}
            `);
            return acceptedClaim(
              input,
              String(existing.conversation_id),
              resumedState,
              metadata.woztellPendingReply,
            );
          }
          await transaction.execute(sql`
            UPDATE ${messages}
            SET metadata = ${JSON.stringify(
              claimMetadata(input, leaseUntil),
            )}::jsonb
            WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          `);
          return acceptedClaim(
            input,
            String(existing.conversation_id),
            resumedState,
          );
        }

        // C-1: reuse on the CONVERSATION's own channel, not on the existence of a
        // prior inbound WhatsApp message. The old EXISTS made a thread invisible
        // until it already contained one, so a thread whose only WhatsApp rows
        // are outbound was missed and a SECOND conversation opened for the same
        // person — splitting the thread the inbox exists to unify. Migration 0032
        // backfills `channel` for every existing row, so this predicate is at
        // least as inclusive as the one it replaces.
        let conversation = rowsFrom(await transaction.execute(sql`
          SELECT
            ${conversations.id} AS id,
            ${conversations.handling} AS handling,
            ${conversations.assignedToProfileId} AS assigned_to_profile_id,
            ${conversations.lastInboundAt} AS last_inbound_at
          FROM ${conversations}
          WHERE ${ownerSql(input)}
            AND ${conversations.status} = 'active'
            AND ${conversations.channel} = 'whatsapp'
          ORDER BY ${conversations.updatedAt} DESC, ${conversations.id} DESC
          LIMIT 1
          FOR UPDATE
        `))[0];
        if (!conversation) {
          const profileId = input.owner.kind === "profile"
            ? input.owner.profileId
            : null;
          const anonymousOwnerHash = input.owner.kind === "anonymous"
            ? input.owner.anonymousOwnerHash
            : null;
          conversation = rowsFrom(await transaction.execute(sql`
            INSERT INTO ${conversations}
              (
                profile_id,
                anonymous_owner_hash,
                locale,
                channel,
                handling,
                contact_id,
                whatsapp_member_id,
                last_inbound_at,
                expires_at,
                last_message_at,
                updated_at
              )
            VALUES (
              ${profileId},
              ${anonymousOwnerHash},
              ${input.locale},
              'whatsapp',
              'bot',
              ${input.contactId},
              ${input.whatsappMemberId},
              ${input.receivedAt},
              ${new Date(current.getTime() + CONVERSATION_RETENTION_MS)},
              ${input.receivedAt},
              ${input.receivedAt}
            )
            RETURNING ${conversations.id} AS id
          `))[0];
        }
        if (!conversation) throw new Error("WOZTELL_CONVERSATION_CREATE_FAILED");
        const conversationId = String(conversation.id);
        const inserted = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messages}
            (
              conversation_id,
              role,
              channel,
              direction,
              content,
              provider_message_id,
              metadata,
              citations,
              created_at
            )
          VALUES (
            ${conversationId},
            'user',
            'whatsapp',
            'inbound',
            ${input.content},
            ${input.providerMessageId},
            ${JSON.stringify(claimMetadata(input, leaseUntil))}::jsonb,
            '[]'::jsonb,
            ${input.receivedAt}
          )
          ON CONFLICT (provider_message_id)
            WHERE provider_message_id IS NOT NULL
          DO NOTHING
          RETURNING ${messages.id} AS id
        `))[0];
        if (!inserted) return {status: "duplicate"};
        const bumped = rowsFrom(await transaction.execute(sql`
          UPDATE ${conversations}
          SET
            last_message_at = GREATEST(
              COALESCE(last_message_at, ${input.receivedAt}),
              ${input.receivedAt}
            ),
            updated_at = GREATEST(updated_at, ${input.receivedAt}),
            -- The 24-hour customer-service window is measured from here, never
            -- from last_message_at, which every outbound reply bumps.
            last_inbound_at = GREATEST(
              COALESCE(last_inbound_at, ${input.receivedAt}),
              ${input.receivedAt}
            ),
            -- COALESCE, not EXCLUDED-style overwrite: the first identity we
            -- learn wins, so a later payload missing the field cannot erase it.
            whatsapp_member_id = COALESCE(whatsapp_member_id, ${input.whatsappMemberId}),
            contact_id = COALESCE(contact_id, ${input.contactId}),
            -- Retention is 365 days after the LAST contact, not after the first.
            -- Before this, expires_at was written once at creation and never
            -- moved, so a thread running for 366 days was eligible for deletion
            -- however active it was.
            expires_at = GREATEST(
              expires_at,
              ${new Date(current.getTime() + CONVERSATION_RETENTION_MS)}
            )
          WHERE ${conversations.id} = ${conversationId}
          RETURNING
            ${conversations.handling} AS handling,
            ${conversations.assignedToProfileId} AS assigned_to_profile_id,
            ${conversations.lastInboundAt} AS last_inbound_at
        `))[0];
        return acceptedClaim(
          input,
          conversationId,
          conversationStateFrom(bumped),
        );
      });
    },

    /**
     * Programme C-3 Task 11 Step 5. `claimInbound` MINUS the lease and the bot
     * state: the same advisory lock, the same conversation-reuse rule, the same
     * `ON CONFLICT (provider_message_id) … DO NOTHING`, and an inserted row whose
     * metadata is already `woztellState: "completed"` — so
     * `decideWoztellClaimState` reports `duplicate` for it forever and NO BOT
     * TURN CAN EVER START FROM AN IMPORTED ROW. That is the whole safety
     * argument: `claimInbound` is what starts a turn, and reaching it from a
     * second boundary with no HMAC in front of it is how a backfill becomes a
     * mass re-reply of a year's backlog.
     *
     * It is a separate method rather than a flag on `claimInbound` because the
     * two differ in what they return, in what they lease and in who may call
     * them, and a boolean that switched all three is one typo away from the
     * mass re-reply.
     *
     * `expires_at` is `now + 365 days`, exactly as `claimInbound` writes it, NOT
     * `receivedAt + 365 days`: retention is measured from the last contact, and
     * the last contact with a row that did not exist here until this statement is
     * the import. Deriving it from an eighteen-month-old provider timestamp would
     * hand the expiry sweep the entire backlog the backfill just imported. How
     * long a WhatsApp thread is kept at all is open question O-5, and is C-9's
     * to answer.
     */
    async importHistoricalInbound(
      actor: unknown,
      input: WoztellInboundClaimInput,
    ): Promise<"imported" | "duplicate"> {
      requireWoztellBackfill(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${input.providerMessageId}, 0)
          )
        `);
        const current = now();
        // The probe is not an optimisation: without it, a re-run over the same
        // cursor window would fall through to the INSERT, and although
        // ON CONFLICT DO NOTHING makes that harmless it would also make every
        // re-run report the whole page as `imported`. Staff read those counters
        // to decide whether to page again.
        const existing = rowsFrom(await transaction.execute(sql`
          SELECT ${messages.id} AS id
          FROM ${messages}
          WHERE ${messages.providerMessageId} = ${input.providerMessageId}
          LIMIT 1
        `))[0];
        if (existing) return "duplicate";

        let conversation = rowsFrom(await transaction.execute(sql`
          SELECT ${conversations.id} AS id
          FROM ${conversations}
          WHERE ${ownerSql(input)}
            AND ${conversations.status} = 'active'
            AND ${conversations.channel} = 'whatsapp'
          ORDER BY ${conversations.updatedAt} DESC, ${conversations.id} DESC
          LIMIT 1
          FOR UPDATE
        `))[0];
        if (!conversation) {
          const profileId = input.owner.kind === "profile"
            ? input.owner.profileId
            : null;
          const anonymousOwnerHash = input.owner.kind === "anonymous"
            ? input.owner.anonymousOwnerHash
            : null;
          conversation = rowsFrom(await transaction.execute(sql`
            INSERT INTO ${conversations}
              (
                profile_id,
                anonymous_owner_hash,
                locale,
                channel,
                handling,
                contact_id,
                whatsapp_member_id,
                last_inbound_at,
                expires_at,
                last_message_at,
                updated_at
              )
            VALUES (
              ${profileId},
              ${anonymousOwnerHash},
              ${input.locale},
              'whatsapp',
              'bot',
              ${input.contactId},
              ${input.whatsappMemberId},
              ${input.receivedAt},
              ${new Date(current.getTime() + CONVERSATION_RETENTION_MS)},
              ${input.receivedAt},
              ${input.receivedAt}
            )
            RETURNING ${conversations.id} AS id
          `))[0];
        }
        if (!conversation) throw new Error("WOZTELL_CONVERSATION_CREATE_FAILED");
        const conversationId = String(conversation.id);
        const inserted = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messages}
            (
              conversation_id,
              role,
              channel,
              direction,
              content,
              provider_message_id,
              metadata,
              citations,
              created_at
            )
          VALUES (
            ${conversationId},
            'user',
            'whatsapp',
            'inbound',
            ${input.content},
            ${input.providerMessageId},
            ${JSON.stringify(importMetadata(input))}::jsonb,
            '[]'::jsonb,
            ${input.receivedAt}
          )
          ON CONFLICT (provider_message_id)
            WHERE provider_message_id IS NOT NULL
          DO NOTHING
          RETURNING ${messages.id} AS id
        `))[0];
        // The advisory lock serialises this backfill against itself and against
        // the webhook, but a second Woztell process is not the only writer: this
        // arm is what a concurrent inbound of the same message looks like.
        if (!inserted) return "duplicate";

        // GREATEST everywhere, because history arrives in whatever order the
        // provider pages it: importing an older entry after a newer one must not
        // drag the thread's clocks backwards. `last_inbound_at` in particular is
        // the 24-hour customer-service window, and moving it backwards would tell
        // the composer a live window had closed.
        await transaction.execute(sql`
          UPDATE ${conversations}
          SET
            last_message_at = GREATEST(
              COALESCE(last_message_at, ${input.receivedAt}),
              ${input.receivedAt}
            ),
            updated_at = GREATEST(updated_at, ${input.receivedAt}),
            last_inbound_at = GREATEST(
              COALESCE(last_inbound_at, ${input.receivedAt}),
              ${input.receivedAt}
            ),
            whatsapp_member_id = COALESCE(whatsapp_member_id, ${input.whatsappMemberId}),
            contact_id = COALESCE(contact_id, ${input.contactId}),
            expires_at = GREATEST(
              expires_at,
              ${new Date(current.getTime() + CONVERSATION_RETENTION_MS)}
            )
          WHERE ${conversations.id} = ${conversationId}
        `);
        return "imported";
      });
    },

    async markRunOwned(providerMessageId: string, leaseUntil: Date) {
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${messages}
        SET metadata = metadata || ${JSON.stringify({
          woztellState: "running",
          woztellLeaseUntil: leaseUntil.toISOString(),
          woztellRunId: providerRunId(providerMessageId),
        })}::jsonb
        WHERE ${messages.providerMessageId} = ${providerMessageId}
          AND COALESCE(metadata->>'woztellState', 'claimed') <> 'completed'
      `);
    },

    async markReplyReady(
      providerMessageId: string,
      reply: string,
      leaseUntil: Date,
    ) {
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${messages}
        SET metadata = metadata || ${JSON.stringify({
          woztellState: "reply_ready",
          woztellPendingReply: reply,
          woztellLeaseUntil: leaseUntil.toISOString(),
        })}::jsonb
        WHERE ${messages.providerMessageId} = ${providerMessageId}
          AND COALESCE(metadata->>'woztellState', 'claimed') <> 'completed'
      `);
    },

    async markCompleted(providerMessageId: string) {
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${messages}
        SET metadata = (
          metadata || ${JSON.stringify({
            woztellState: "completed",
            woztellLeaseUntil: null,
          })}::jsonb
        ) - 'woztellPendingReply'
        WHERE ${messages.providerMessageId} = ${providerMessageId}
      `);
    },

    async setWhatsappOptIn(profileId: string, optedIn: boolean) {
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${profiles}
        SET whatsapp_opt_in = ${optedIn}, updated_at = ${now()}
        WHERE ${profiles.id} = ${profileId}
      `);
    },
  };
}

export function withDurableWoztellReplyState(
  dependencies: WoztellWebhookProcessorDependencies,
): WoztellWebhookProcessorDependencies {
  return dependencies;
}
