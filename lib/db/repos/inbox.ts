import "server-only";

import {sql} from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
// Type-only, so nothing of the adapter (or its `server-only` import) is pulled
// into this module at runtime — the same shape `lib/db/repos/deliveries.ts` uses
// for `DeliveryFailureCode`. The union is imported rather than retyped because
// the classification below has to stay exhaustive over the codes the adapter
// actually throws; a local copy would go stale silently.
import type {WoztellDeliveryFailureCode} from "@/lib/channels/woztell";
import {derivedMessageDirection} from "@/lib/db/message-direction";
import {
  auditEvents,
  contacts,
  conversations,
  messageRoleEnum,
  messages,
  profiles,
  staffTasks,
  type MessageDeliveryStatus,
} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type InboxChannelFilter = "all" | "whatsapp" | "web";

export type InboxHandling = "bot" | "human" | "closed";

export type InboxConversationSummary = Readonly<{
  id: string;
  channel: "whatsapp" | "web";
  locale: string;
  status: string;
  /** C-2: the interlock between the concierge and a person. */
  handling: InboxHandling;
  /** Member display name; null for an anonymous/prospect owner. */
  ownerLabel: string | null;
  profileId: string | null;
  contactId: string | null;
  assignedToProfileId: string | null;
  assigneeLabel: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  /** The 24-hour customer-service window is measured from here, never from `lastMessageAt`. */
  lastInboundAt: Date | null;
  lastStaffReadAt: Date | null;
  unread: boolean;
  messageCount: number;
  escalated: boolean;
}>;

export type InboxMessage = Readonly<{
  id: string;
  role: "user" | "assistant" | "tool" | "staff";
  direction: "inbound" | "outbound";
  channel: "whatsapp" | "web";
  content: string;
  deliveryStatus: MessageDeliveryStatus | null;
  templateKey: string | null;
  errorCode: string | null;
  createdAt: Date;
}>;

export type InboxTranscript = Readonly<{conversation: InboxConversationSummary; messages: readonly InboxMessage[]}>;

export type StaffOutboundKind = "session" | "template";

export type QueuedStaffMessage = Readonly<{
  messageId: string;
  conversationId: string;
  outboundKey: string;
  /**
   * Whether THIS caller may call the adapter. `"queued"` is a live send claim
   * (fresh or inherited); the other two are short-circuits (S-8).
   */
  disposition: "queued" | "already_queued" | "already_sent";
  recipient: Readonly<{phoneE164: string | null; profileId: string | null; contactId: string | null; whatsappOptIn: boolean}>;
  /** Read from the row, not from the caller: the window is a persisted fact. */
  lastInboundAt: Date | null;
}>;

const listOptionsSchema = z.object({
  channel: z.enum(["all", "whatsapp", "web"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
}).strict();

/**
 * `lib/admin/inbox-action-core.ts` mints this as
 * `"inbox:" + conversationId + ":" + sha256(kind|content|templateKey|sortedVariables).slice(0,32)`.
 * Pinned as a shape here so a caller cannot invent its own key format and
 * quietly opt out of `messages_outbound_key_unique` — an outbound key that is
 * not deterministic in the draft is a key that dedupes nothing.
 */
const outboundKeySchema = z.string().regex(/^inbox:[0-9a-f-]{36}:[0-9a-f]{32}$/);

const queueStaffMessageSchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["session", "template"]),
  content: z.string().trim().min(1).max(4_096),
  templateKey: z.string().trim().min(1).max(120).nullable().default(null),
  templateVariables: z.record(z.string().max(1_000)).default({}),
  outboundKey: outboundKeySchema,
}).strict()
  .refine((value) => value.kind === "session" || value.templateKey !== null, {message: "TEMPLATE_KEY_REQUIRED"})
  // The key embeds a conversation id, and the two conflict statements below
  // match on `outbound_key` alone. A key minted for a different conversation
  // would return that conversation's `messageId` beside this one's `recipient`
  // and `lastInboundAt` — a reply queued against one thread and sent to the
  // number of another. Only a programming error can produce that pair today,
  // because Task 7 mints the key from the same parsed input, so this is what
  // makes the branch self-consistent by construction rather than by discipline.
  .refine((value) => value.outboundKey.startsWith(`inbox:${value.conversationId}:`), {message: "OUTBOUND_KEY_CONVERSATION_MISMATCH"});

const settleStaffMessageSchema = z.object({
  outboundKey: outboundKeySchema,
  outcome: z.discriminatedUnion("status", [
    z.object({status: z.literal("sent"), providerId: z.string().trim().min(1).max(255)}).strict(),
    z.object({status: z.literal("failed"), errorCode: z.string().trim().min(1).max(120)}).strict(),
  ]),
}).strict();

const setHandlingSchema = z.object({
  conversationId: z.string().uuid(),
  handling: z.enum(["bot", "human", "closed"]),
}).strict();

const assignSchema = z.object({
  conversationId: z.string().uuid(),
  assignedToProfileId: z.string().min(1).max(255).nullable(),
}).strict();

const conversationIdSchema = z.string().uuid();

/**
 * S-8. Two minutes comfortably exceeds the adapter's own request timeout and is
 * short enough that a send abandoned by a crash is retryable inside one staff
 * attention span. Built fresh on each use rather than shared as one `SQL`
 * object, the way `woztell-inbound-events.ts` builds its tick order: two slots
 * of one statement holding the same fragment instance is a question nobody
 * should have to answer.
 */
function sendClaimLease(): SQL {
  return sql`now() + INTERVAL '2 minutes'`;
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function handlingFrom(value: unknown): InboxHandling {
  return value === "human" || value === "closed" ? value : "bot";
}

/**
 * Exhaustive over `message_role`. The coercion this replaces was
 * `row.role === "assistant" ? "assistant" : row.role === "tool" ? "tool" : "user"`,
 * whose default arm swallowed the value 0031 added: every staff reply would have
 * rendered under `Admin.inbox.roles.user` — "Sender" in English, 「發送者」 in
 * Chinese, i.e. attributed to the prospect — with no type error and no failing
 * test. `satisfies Record<MessageRole, …>` makes a fifth enum value a compile
 * error instead of a silent misattribution.
 *
 * `Object.hasOwn`, not `in`: `"toString" in INBOX_ROLES` is true through the
 * prototype, and a role is a value read out of a row.
 */
const INBOX_ROLES = {
  user: "user",
  assistant: "assistant",
  tool: "tool",
  staff: "staff",
} as const satisfies Record<(typeof messageRoleEnum.enumValues)[number], InboxMessage["role"]>;

function roleFrom(value: unknown): InboxMessage["role"] {
  // The column is an enum, so the fallback is unreachable in practice; it exists
  // because a read path must not throw on a row it cannot classify. A NEW role
  // goes through the map above, never through here.
  return typeof value === "string" && Object.hasOwn(INBOX_ROLES, value)
    ? INBOX_ROLES[value as keyof typeof INBOX_ROLES]
    : "user";
}

function deliveryStatusFrom(value: unknown): MessageDeliveryStatus | null {
  switch (value) {
    case "queued":
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return value;
    default:
      // NULL is "this message has no delivery state" — every inbound row and
      // every web row — not "unknown".
      return null;
  }
}

function messageFrom(row: Record<string, unknown>): InboxMessage {
  return {
    id: String(row.id),
    role: roleFrom(row.role),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    channel: row.channel === "whatsapp" ? "whatsapp" : "web",
    content: String(row.content ?? ""),
    deliveryStatus: deliveryStatusFrom(row.delivery_status),
    templateKey: stringFrom(row.template_key),
    errorCode: stringFrom(row.error_code),
    createdAt: dateFrom(row.created_at) ?? new Date(0),
  };
}

function summaryFrom(row: Record<string, unknown>): InboxConversationSummary {
  const lastMessageAt = dateFrom(row.last_message_at);
  const lastStaffReadAt = dateFrom(row.last_staff_read_at);
  return {
    id: String(row.id),
    channel: row.channel === "whatsapp" ? "whatsapp" : "web",
    locale: String(row.locale ?? "en"),
    status: String(row.status ?? "active"),
    handling: handlingFrom(row.handling),
    ownerLabel: stringFrom(row.display_name),
    profileId: stringFrom(row.profile_id),
    contactId: stringFrom(row.contact_id),
    assignedToProfileId: stringFrom(row.assigned_to_profile_id),
    assigneeLabel: stringFrom(row.assignee_display_name),
    lastMessage: typeof row.last_message === "string" ? row.last_message : null,
    lastMessageAt,
    lastInboundAt: dateFrom(row.last_inbound_at),
    lastStaffReadAt,
    // A thread nobody has opened is unread even when it is silent, so a NULL
    // read stamp is unread rather than "nothing new".
    unread: lastStaffReadAt === null || (lastMessageAt !== null && lastMessageAt > lastStaffReadAt),
    messageCount: Number(row.message_count ?? 0),
    escalated: Number(row.open_task_count ?? 0) > 0,
  };
}

/**
 * The one header projection, shared by `getTranscript` and by every mutation
 * that returns a summary. It reads `c.channel` directly: until 0031 the channel
 * was derived from the newest message, which called a WhatsApp thread "web" the
 * moment a web reply landed on it — a derivation the send path cannot trust,
 * because it decides whether the WhatsApp adapter may be reached for at all.
 */
function conversationHeaderQuery(conversationId: string): SQL {
  return sql`
    SELECT c.id, c.agent_kind, c.locale, c.status, c.channel, c.handling,
           c.last_message_at, c.last_inbound_at, c.last_staff_read_at,
           c.profile_id, c.contact_id, c.assigned_to_profile_id,
           p.display_name, assignee.display_name AS assignee_display_name,
           (SELECT content FROM ${messages} m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
           (SELECT count(*)::int FROM ${messages} m WHERE m.conversation_id = c.id) AS message_count,
           (SELECT count(*)::int FROM ${staffTasks} t WHERE t.status = 'open' AND t.context->>'conversationId' = c.id::text) AS open_task_count
    FROM ${conversations} c
    LEFT JOIN ${profiles} p ON p.id = c.profile_id
    LEFT JOIN ${profiles} assignee ON assignee.id = c.assigned_to_profile_id
    WHERE c.id = ${conversationId} AND c.status <> 'deleted'
  `;
}

async function readSummary(
  executor: AutomationSqlExecutor,
  conversationId: string,
): Promise<InboxConversationSummary> {
  const row = rowsFrom(await executor.execute(conversationHeaderQuery(conversationId)))[0];
  if (!row) throw new Error("INBOX_CONVERSATION_NOT_FOUND");
  return summaryFrom(row);
}

function auditInsert(
  actor: AdminActor,
  action: string,
  conversationId: string,
  metadata: Readonly<Record<string, unknown>>,
): SQL {
  return sql`
    INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
    VALUES (${actor.profileId}, ${actor.kind}, ${action}, 'conversation', ${conversationId}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

/**
 * The conversation as it stands, locked, before a handling or assignment change
 * decides against it. Two staff acting on one thread must serialise or the
 * second decision is made against the first's stale state.
 */
async function lockConversation(
  transaction: AutomationSqlExecutor,
  conversationId: string,
): Promise<Record<string, unknown>> {
  const row = rowsFrom(await transaction.execute(sql`
    SELECT c.id, c.channel, c.handling, c.assigned_to_profile_id
    FROM ${conversations} c
    WHERE c.id = ${conversationId} AND c.status <> 'deleted'
    FOR UPDATE
  `))[0];
  if (!row) throw new Error("INBOX_CONVERSATION_NOT_FOUND");
  return row;
}

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {code?: unknown; cause?: unknown};
  return candidate.code === "23505" || uniqueViolation(candidate.cause);
}

/** The role every staff reply is written under; `message_role` gained it in 0031. */
const STAFF_ROLE = "staff" as const;

/**
 * Which adapter failures mean **the provider definitively did not take the
 * message**, and are therefore the only ones a re-take may re-send under the
 * same deterministic `outbound_key`.
 *
 * This guard used to be `delivery_status = 'failed' AND provider_message_id IS
 * NULL`, which reads as "the provider never issued an id, so it never accepted
 * it" — and is wrong, because the adapter throws before it can return an id no
 * matter *why* it threw. Three of the five codes below mean acceptance is
 * UNCERTAIN, not refused, and the most likely one of all is the bring-up
 * failure O-1 predicts: `sendLive` gets HTTP 200, WhatsApp delivers the
 * message, `providerId(body)` does not recognise the response shape (still an
 * unverified guess) and `lib/channels/woztell.ts` throws
 * `provider_unclassified_failure` — *after* the `!httpResponse.ok` arm has
 * already passed. Settling that row `failed` with no id and then re-taking it
 * on the next Send click sends the member the same reply twice, once more per
 * click, with nothing on the row or in `audit_events` recording it.
 *
 * So the discriminator is the code the row already carries, not the absence of
 * an id. `provider_message_id IS NULL` stays as the second half of the guard —
 * `recordDeliveryStatus` only ever reaches a row BY its provider id, so a
 * provider-reported delivery failure keeps its id and stays settled either way.
 *
 * A `Record` rather than a list, so that a sixth `WoztellDeliveryFailureCode`
 * is a compile error here and someone has to decide which side it falls on. An
 * unrecognised or NULL `error_code` matches nothing below and is therefore not
 * re-takeable: the guard fails closed, towards "do not send it again". Staff
 * are not stuck — the key is deterministic in the content, so an edited draft
 * mints a new key and a new row, which is the same escape hatch a
 * provider-reported failure has always had.
 */
const PROVIDER_REFUSED_SEND = {
  // 4xx. The request was rejected outright; nothing was queued at WhatsApp.
  provider_client_error: true,
  // 429. Refused before acceptance, by definition of the status.
  retryable_rate_limit: true,
  // `fetch` itself threw. That covers a connection that was never made AND a
  // response that was never read off a request the provider did process, and
  // we cannot tell the two apart from here.
  retryable_network: false,
  // 5xx. Named for exactly this: the provider may have taken it and then failed
  // to say so.
  provider_acceptance_uncertain: false,
  // HTTP 200 with a body `providerId()` did not recognise, or a body that was
  // not JSON. The status line says the provider accepted it.
  provider_unclassified_failure: false,
} as const satisfies Record<WoztellDeliveryFailureCode, boolean>;

const PROVIDER_REFUSED_ERROR_CODES: readonly string[] = Object.entries(PROVIDER_REFUSED_SEND)
  .filter(([, refused]) => refused)
  .map(([code]) => code);

/**
 * The re-take arm of the claim `UPDATE`, built from the map above so the two
 * cannot drift. `FALSE` when the map classifies nothing as refused, because
 * `IN ()` is a syntax error and a release that could not re-send anything is a
 * far smaller problem than one whose claim statement never parses.
 */
function refusedSendPredicate(): SQL {
  if (PROVIDER_REFUSED_ERROR_CODES.length === 0) return sql`FALSE`;
  const codes = sql.join(PROVIDER_REFUSED_ERROR_CODES.map((code) => sql`${code}`), sql`, `);
  return sql`(
                ${messages.deliveryStatus} = 'failed'
                AND ${messages.providerMessageId} IS NULL
                AND ${messages.errorCode} IN (${codes})
              )`;
}

/**
 * Staff read model and staff write path over conversations + messages +
 * staff_tasks.
 *
 * **S-6: the write methods live here and not on `conversationsRepository`.**
 * Every write there is gated by a `ConversationOwner` — `ownerPredicate(owner)`
 * / `getOwnedFrom` — so routing a staff reply through it would mean an admin
 * constructing a member's owner value, which is exactly the forgeable-principal
 * shape boundary 10 and `tests/unit/server-action-actor-boundary.test.ts` exist
 * to prevent. Here the gate is `requireAdmin(actor)` and the sender is recorded
 * as `sent_by_profile_id = actor.profileId`.
 */
export function createInboxRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async listConversations(actor: Actor, options: unknown): Promise<readonly InboxConversationSummary[]> {
      requireAdmin(actor);
      const parsed = listOptionsSchema.parse(options);
      const database = await loadDatabase();
      // Scopes the CONVERSATION, not its newest message: `latest` no longer
      // projects a channel, because 0031 gave the conversation its own.
      const channelFilter = parsed.channel === "all" ? sql`TRUE` : sql`c.channel = ${parsed.channel}`;
      const rows = rowsFrom(await database.execute(sql`
        WITH latest AS (
          SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id, m.content AS last_message, m.created_at
          FROM ${messages} m
          ORDER BY m.conversation_id, m.created_at DESC
        ),
        counts AS (
          SELECT conversation_id, count(*)::int AS message_count FROM ${messages} GROUP BY conversation_id
        ),
        tasks AS (
          SELECT (context->>'conversationId') AS conversation_id, count(*)::int AS open_task_count
          FROM ${staffTasks} WHERE status = 'open' GROUP BY context->>'conversationId'
        )
        SELECT c.id, c.agent_kind, c.locale, c.status, c.channel, c.handling,
               c.last_message_at, c.last_inbound_at, c.last_staff_read_at,
               c.profile_id, c.contact_id, c.assigned_to_profile_id,
               p.display_name, assignee.display_name AS assignee_display_name,
               latest.last_message,
               COALESCE(counts.message_count, 0) AS message_count,
               COALESCE(tasks.open_task_count, 0) AS open_task_count
        FROM ${conversations} c
        LEFT JOIN ${profiles} p ON p.id = c.profile_id
        LEFT JOIN ${profiles} assignee ON assignee.id = c.assigned_to_profile_id
        LEFT JOIN latest ON latest.conversation_id = c.id
        LEFT JOIN counts ON counts.conversation_id = c.id
        LEFT JOIN tasks ON tasks.conversation_id = c.id::text
        WHERE c.agent_kind = 'concierge' AND c.status <> 'deleted' AND ${channelFilter}
        ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
        LIMIT ${parsed.limit}
      `));
      return rows.map(summaryFrom);
    },

    async getTranscript(actor: Actor, conversationId: string): Promise<InboxTranscript | null> {
      requireAdmin(actor);
      const id = conversationIdSchema.parse(conversationId);
      const database = await loadDatabase();
      const header = rowsFrom(await database.execute(conversationHeaderQuery(id)))[0];
      if (!header) return null;
      const transcript = rowsFrom(await database.execute(sql`
        SELECT id, role, direction, channel, content, delivery_status, template_key, error_code, created_at
        FROM ${messages}
        WHERE conversation_id = ${id}
        ORDER BY created_at ASC, id ASC
        LIMIT 500
      `));
      return {conversation: summaryFrom(header), messages: transcript.map(messageFrom)};
    },

    /**
     * The write-ahead half of a staff reply: one `messages` row at
     * `delivery_status='queued'` and one `audit_events` row, in one transaction,
     * before anything is handed to the provider (S-7). An audit row written
     * after the adapter returned would be missing for exactly the sends that
     * crashed.
     *
     * `disposition` says whether THIS caller may call the adapter, and that is a
     * lease, not a row count (S-8). `outbound_key` dedupes the ROW;
     * `send_claim_expires_at` dedupes the SEND. Without the second, two submits
     * of one draft — a double-click, or a Server Action the client retried —
     * produce one `messages` row, one audit row and **two WhatsApp messages to
     * the member**.
     */
    async queueStaffMessage(actor: Actor, input: unknown): Promise<QueuedStaffMessage> {
      requireAdmin(actor);
      const parsed = queueStaffMessageSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        // FOR UPDATE OF c, never a bare FOR UPDATE: PostgreSQL refuses to lock
        // the nullable side of an outer join, and both joins here are LEFT.
        const conversation = rowsFrom(await transaction.execute(sql`
          SELECT c.id, c.channel, c.handling, c.last_inbound_at, c.profile_id, c.contact_id,
                 p.whatsapp_number AS profile_whatsapp_number,
                 p.whatsapp_opt_in AS profile_whatsapp_opt_in,
                 ct.phone_e164 AS contact_phone_e164,
                 ct.whatsapp_opt_in AS contact_whatsapp_opt_in
          FROM ${conversations} c
          LEFT JOIN ${profiles} p ON p.id = c.profile_id
          LEFT JOIN ${contacts} ct ON ct.id = c.contact_id
          WHERE c.id = ${parsed.conversationId} AND c.status <> 'deleted'
          FOR UPDATE OF c
        `))[0];
        if (!conversation) throw new Error("INBOX_CONVERSATION_NOT_FOUND");
        if (conversation.channel !== "whatsapp") throw new Error("INVALID_INBOX_CHANNEL");
        // Taking a thread over is a separate, audited act. Replying into one the
        // concierge still owns would interleave a person and a bot in the same
        // thread, each unaware of the other's reply.
        if (conversation.handling !== "human") throw new Error("INVALID_INBOX_HANDLING");

        const contactId = stringFrom(conversation.contact_id);
        const contactPhone = stringFrom(conversation.contact_phone_e164);
        const profilePhone = stringFrom(conversation.profile_whatsapp_number);
        // The consent flag belongs to whichever side the number came from — the
        // contact's number is the one the message actually arrived from. Reading
        // the other side's flag here would report consent we do not hold for the
        // recipient we are about to reach.
        const recipient = {
          phoneE164: contactPhone ?? profilePhone,
          profileId: stringFrom(conversation.profile_id),
          contactId,
          whatsappOptIn: Boolean(contactPhone !== null ? conversation.contact_whatsapp_opt_in : conversation.profile_whatsapp_opt_in),
        } as const;
        const lastInboundAt = dateFrom(conversation.last_inbound_at);

        // `direction` goes through the shared twin rather than a hand-written
        // literal: `messages.direction` defaults to 'inbound' (S-4), so a
        // literal that drifts would silently take a staff reply out of the
        // delivery ledger with no type error and no failing test. Kept out of
        // the SQL template so the emitted statement carries no comment naming
        // the opposite value.
        const inserted = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messages}
            (
              conversation_id,
              role,
              channel,
              direction,
              content,
              delivery_status,
              sent_by_profile_id,
              template_key,
              outbound_key,
              send_claim_expires_at,
              metadata,
              citations
            )
          VALUES (
            ${parsed.conversationId},
            ${STAFF_ROLE},
            'whatsapp',
            ${derivedMessageDirection({role: STAFF_ROLE})},
            ${parsed.content},
            'queued',
            ${actor.profileId},
            ${parsed.templateKey},
            ${parsed.outboundKey},
            ${sendClaimLease()},
            ${JSON.stringify({outboundKind: parsed.kind, templateVariables: parsed.templateVariables})}::jsonb,
            '[]'::jsonb
          )
          ON CONFLICT (outbound_key)
            WHERE outbound_key IS NOT NULL
          DO NOTHING
          RETURNING ${messages.id} AS id
        `))[0];

        if (inserted) {
          const messageId = String(inserted.id);
          // S-7: the durable commitment to send, in the same transaction as the
          // row that carries it. The outcome lives on the messages row itself
          // and is joinable through this `messageId`.
          await transaction.execute(auditInsert(actor, "conversation.reply.queued", parsed.conversationId, {
            messageId,
            outboundKey: parsed.outboundKey,
            kind: parsed.kind,
            templateKey: parsed.templateKey,
          }));
          return {
            messageId,
            conversationId: parsed.conversationId,
            outboundKey: parsed.outboundKey,
            disposition: "queued",
            recipient,
            lastInboundAt,
          };
        }

        // Another submit owns the row, or an earlier attempt left it behind. A
        // conflicting INSERT can wait for the other transaction, but every CTE
        // in that statement still shares the original snapshot — so this is a
        // SEPARATE statement, the same shape and for the same reason as
        // `appendMessageFrom`.
        //
        // Nothing below writes an audit row on any branch: the commitment was
        // recorded when the row was inserted, and a second row per retry would
        // turn the audit trail into a retry log.
        //
        // Re-taking a settled `failed` row is what makes S-8's "a failed row is
        // immediately re-sendable" true. Clearing `send_claim_expires_at` in
        // `settleStaffMessage` is necessary and, alone, inert: while this guard
        // read `delivery_status = 'queued'` only, a staff retry of a reply the
        // adapter had refused matched nothing here, fell through to the SELECT
        // below and came back `already_sent`. The action layer short-circuits
        // that before the adapter, so the member never received the reply and
        // the inbox reported it as sent — a lost message dressed as a success,
        // with no path in this repository that could ever re-send the row.
        //
        // `PROVIDER_REFUSED_SEND` is the narrowing that keeps the re-take
        // honest, and it reads the code the row already carries rather than the
        // absence of a provider id: the adapter throws before it returns an id
        // whatever went wrong, so `provider_message_id IS NULL` cannot tell a
        // definite refusal from a send WhatsApp has already accepted. See that
        // constant for the incident.
        //
        // The old `error_code` is folded into `metadata` before the column is
        // cleared. This branch deliberately writes no audit row (below), so
        // without it a re-take erases the only evidence that the provider was
        // ever handed this message — which is the one fact you need to answer
        // "did the member get it twice?" after the fact.
        const claimed = rowsFrom(await transaction.execute(sql`
          UPDATE ${messages}
          SET delivery_status = 'queued',
              error_code = NULL,
              send_claim_expires_at = ${sendClaimLease()},
              metadata = ${messages.metadata} || jsonb_build_object(
                'sendRetakes',
                COALESCE(${messages.metadata} -> 'sendRetakes', '[]'::jsonb)
                  || jsonb_build_object('at', now(), 'previousErrorCode', ${messages.errorCode})
              )
          WHERE ${messages.outboundKey} = ${parsed.outboundKey}
            AND (
              ${messages.deliveryStatus} = 'queued'
              OR ${refusedSendPredicate()}
            )
            AND (${messages.sendClaimExpiresAt} IS NULL OR ${messages.sendClaimExpiresAt} <= now())
          RETURNING ${messages.id} AS id
        `))[0];
        if (claimed) {
          // Either an abandoned send inherited — the previous attempt crashed
          // between the adapter and the settle — or a refused one re-queued.
          // Both are now `queued`, and `queued` is the re-send state.
          return {
            messageId: String(claimed.id),
            conversationId: parsed.conversationId,
            outboundKey: parsed.outboundKey,
            disposition: "queued",
            recipient,
            lastInboundAt,
          };
        }

        const existing = rowsFrom(await transaction.execute(sql`
          SELECT ${messages.id} AS id, ${messages.deliveryStatus} AS delivery_status
          FROM ${messages}
          WHERE ${messages.outboundKey} = ${parsed.outboundKey}
          LIMIT 1
        `))[0];
        if (!existing) throw new Error("INBOX_MESSAGE_NOT_FOUND");
        return {
          messageId: String(existing.id),
          conversationId: parsed.conversationId,
          outboundKey: parsed.outboundKey,
          // Left `queued` means another submit holds a LIVE claim. Anything else
          // is a settled row the claim above deliberately refused: `sent`,
          // `delivered`, `read`, a `failed` row carrying a provider id (a
          // message WhatsApp accepted and then could not deliver), or a `failed`
          // row whose `error_code` leaves acceptance uncertain. None of them is
          // this caller's send to make.
          disposition: existing.delivery_status === "queued" ? "already_queued" : "already_sent",
          recipient,
          lastInboundAt,
        };
      });
    },

    /**
     * The settle half. Guarded on `delivery_status = 'queued'` so it is a no-op
     * once the row has moved on, and it clears the claim either way. Clearing it
     * is half of what makes a `failed` row immediately re-sendable (S-8); the
     * other half is `queueStaffMessage`'s claim `UPDATE`, which re-takes a
     * `failed` row only when `error_code` says the provider definitively
     * refused it (`PROVIDER_REFUSED_SEND`). Neither half works alone: a cleared
     * lease on a row no statement will ever re-take is inert.
     *
     * `errorCode` therefore stops being a label and becomes load-bearing. Write
     * the adapter's own `WoztellDeliveryFailure.code` here verbatim; a caller
     * that substitutes a summary of its own makes every failure un-retakeable,
     * which fails closed but silently.
     */
    async settleStaffMessage(actor: Actor, input: unknown): Promise<void> {
      requireAdmin(actor);
      const parsed = settleStaffMessageSchema.parse(input);
      const database = await loadDatabase();
      if (parsed.outcome.status === "failed") {
        await database.execute(sql`
          UPDATE ${messages}
          SET delivery_status = 'failed', error_code = ${parsed.outcome.errorCode}, send_claim_expires_at = NULL
          WHERE ${messages.outboundKey} = ${parsed.outboundKey} AND ${messages.deliveryStatus} = 'queued'
        `);
        return;
      }
      const providerId = parsed.outcome.providerId;
      try {
        await database.execute(sql`
          UPDATE ${messages}
          SET delivery_status = 'sent', provider_message_id = ${providerId}, send_claim_expires_at = NULL
          WHERE ${messages.outboundKey} = ${parsed.outboundKey} AND ${messages.deliveryStatus} = 'queued'
        `);
      } catch (error) {
        // 23505 on messages_provider_message_id_unique: the outbound echo got
        // here first and already adopted the id. The message went out; only the
        // bookkeeping raced. Leaving the row `queued` would be far worse than
        // losing the id here — `queued` is the re-send state, so a throw would
        // send the member the same message twice.
        if (!uniqueViolation(error)) throw error;
        await database.execute(sql`
          UPDATE ${messages}
          SET delivery_status = 'sent', send_claim_expires_at = NULL
          WHERE ${messages.outboundKey} = ${parsed.outboundKey} AND ${messages.deliveryStatus} = 'queued'
        `);
      }
    },

    /** Taking a thread over, or handing it back. Audited in the same transaction. */
    async setHandling(actor: Actor, input: unknown): Promise<InboxConversationSummary> {
      requireAdmin(actor);
      const parsed = setHandlingSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const current = await lockConversation(transaction, parsed.conversationId);
        // A web thread has no number behind it and no customer-service window to
        // reply inside, so handing it to a person would hand them a composer
        // that cannot send. Refuse here rather than at the adapter.
        if (parsed.handling === "human" && current.channel !== "whatsapp") throw new Error("INVALID_INBOX_CHANNEL");
        await transaction.execute(sql`
          UPDATE ${conversations}
          SET handling = ${parsed.handling}, updated_at = now()
          WHERE ${conversations.id} = ${parsed.conversationId}
        `);
        await transaction.execute(auditInsert(actor, "conversation.handling.changed", parsed.conversationId, {
          from: handlingFrom(current.handling),
          to: parsed.handling,
        }));
        return await readSummary(transaction, parsed.conversationId);
      });
    },

    async assign(actor: Actor, input: unknown): Promise<InboxConversationSummary> {
      requireAdmin(actor);
      const parsed = assignSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const current = await lockConversation(transaction, parsed.conversationId);
        // `assigned_to_profile_id` references `profiles.id`, so an assignee who
        // does not exist is a 23503 rather than a silently dangling name.
        await transaction.execute(sql`
          UPDATE ${conversations}
          SET assigned_to_profile_id = ${parsed.assignedToProfileId}, updated_at = now()
          WHERE ${conversations.id} = ${parsed.conversationId}
        `);
        await transaction.execute(auditInsert(actor, "conversation.assigned", parsed.conversationId, {
          from: stringFrom(current.assigned_to_profile_id),
          to: parsed.assignedToProfileId,
        }));
        return await readSummary(transaction, parsed.conversationId);
      });
    },

    /**
     * Closing sets `handling`, not `conversations.status`. `status` is the
     * lifecycle column the concierge's conversation-reuse rule and the retention
     * sweeps read; flipping it here would take a thread staff merely finished
     * with out of the bot's reach as well.
     */
    async close(actor: Actor, conversationId: string): Promise<InboxConversationSummary> {
      requireAdmin(actor);
      const id = conversationIdSchema.parse(conversationId);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const current = await lockConversation(transaction, id);
        await transaction.execute(sql`
          UPDATE ${conversations}
          SET handling = 'closed', updated_at = now()
          WHERE ${conversations.id} = ${id}
        `);
        await transaction.execute(auditInsert(actor, "conversation.closed", id, {
          from: handlingFrom(current.handling),
        }));
        return await readSummary(transaction, id);
      });
    },

    /**
     * No audit row, deliberately. Reading is not a mutation that matters, and a
     * thread staff open six times a day would file six audit rows for every
     * reply it files one for — burying the decisions that do matter.
     */
    async markRead(actor: Actor, conversationId: string): Promise<void> {
      requireAdmin(actor);
      const id = conversationIdSchema.parse(conversationId);
      const database = await loadDatabase();
      await database.execute(sql`
        UPDATE ${conversations}
        SET last_staff_read_at = now()
        WHERE ${conversations.id} = ${id}
      `);
    },
  };
}

export type InboxRepository = ReturnType<typeof createInboxRepository>;
export const inboxRepository = createInboxRepository();
