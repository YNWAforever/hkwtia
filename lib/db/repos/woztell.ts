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

export function createPostgresWoztellStore(
  now: () => Date = () => new Date(),
) {
  return {
    async resolveProfile(normalizedSender: string) {
      const database = await getDb();
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
      const database = await getDb();
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
            ${conversations.lastInboundAt} AS last_inbound_at
        `))[0];
        return acceptedClaim(
          input,
          conversationId,
          conversationStateFrom(bumped),
        );
      });
    },

    async markRunOwned(providerMessageId: string, leaseUntil: Date) {
      const database = await getDb();
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
      const database = await getDb();
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
      const database = await getDb();
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
      const database = await getDb();
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
