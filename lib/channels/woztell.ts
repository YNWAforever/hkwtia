import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
import {isOptOutText} from "@/lib/whatsapp/opt-out";
import {
  WOZTELL_MAX_ECHO_TEXT_CHARS,
  WOZTELL_MAX_ERROR_CODE_CHARS,
  WOZTELL_MAX_MEMBER_ID_CHARS,
  WOZTELL_MAX_PROVIDER_MESSAGE_ID_CHARS,
} from "@/lib/whatsapp/provider-field-limits";

// The normaliser moved to lib/whatsapp/number.ts (Phase A) so the join and
// portal forms share it; the re-export keeps lib/ai/woztell-webhook.ts and the
// existing tests importing it from here.
export {normalizeWhatsAppNumber};
import type {
  ChannelAdapter,
  ChannelResult,
  NormalizedInbound,
  SessionMessageInput,
  TemplateMessageInput,
  WhatsAppRecipient,
} from "@/lib/channels/types";

const WOZTELL_SEND_RESPONSES_URL = "https://bot.api.woztell.com/sendResponses";
// Exported for Task 7's pre-flight check and Task 8's countdown. Both used to
// be free to retype `24 * 60 * 60 * 1_000`, which is how a UI comes to promise a
// window that `sendSessionMessage` below then refuses. One constant, two
// readers, no drift when Meta changes the window.
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;
/**
 * How long one send may spend inside `fetch` before it is aborted.
 *
 * C-2. `lib/db/repos/inbox.ts` leases a staff send for `SEND_CLAIM_LEASE_MS`
 * and justified that number by saying it "comfortably exceeds the adapter's own
 * request timeout". The adapter had no such timeout: `sendLive` called `fetch`
 * with no `signal`, so the real bound was undici's ~300s header timeout — two
 * and a half times the lease. A send that hangs that long has its claim expire
 * underneath it, the next submit inherits the claim and calls the adapter
 * again, and the member receives the reply twice from one `messages` row and
 * one audit row. The lease's justification is now true by construction, and
 * `tests/unit/inbox-write-repository.test.ts` keeps the two in that order.
 *
 * An abort lands in `sendLive`'s `catch` as `retryable_network`, which is
 * deliberately NOT one of `PROVIDER_REFUSED_SEND`'s definite refusals: a
 * timeout cannot tell a connection that was never made from a response that was
 * never read off a request the provider did process.
 */
export const WOZTELL_REQUEST_TIMEOUT_MS = 30_000;
const MIN_NUMERIC_TIMESTAMP_MS = Date.UTC(2000, 0, 1);
const MAX_NUMERIC_TIMESTAMP_MS = Date.UTC(2100, 0, 1);
const EPOCH_MILLISECONDS_THRESHOLD = 100_000_000_000;

export type WoztellEnvironment = Readonly<{
  WOZTELL_API_TOKEN?: string;
  WOZTELL_CHANNEL_ID?: string;
  WOZTELL_WEBHOOK_SECRET?: string;
  RUN_LIVE_WOZTELL?: string;
}>;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type WoztellDeliveryFailureCode =
  | "retryable_network"
  | "retryable_rate_limit"
  | "provider_acceptance_uncertain"
  | "provider_client_error"
  | "provider_unclassified_failure";

export class WoztellDeliveryFailure extends Error {
  readonly code: WoztellDeliveryFailureCode;

  constructor(code: WoztellDeliveryFailureCode) {
    super(`WHATSAPP_DELIVERY_FAILED:${code}`);
    this.name = "WoztellDeliveryFailure";
    this.code = code;
  }
}

type LiveCredentials = Readonly<{token: string; channelId: string}>;

function nonblank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function liveCredentials(env: WoztellEnvironment): LiveCredentials | null {
  if (env.RUN_LIVE_WOZTELL !== "1") return null;
  const token = nonblank(env.WOZTELL_API_TOKEN);
  const channelId = nonblank(env.WOZTELL_CHANNEL_ID);
  return token && channelId ? {token, channelId} : null;
}

function recipientNumber(recipient: WhatsAppRecipient): string | null {
  if (!recipient.whatsappOptIn) return null;
  return nonblank(recipient.whatsappNumber ?? undefined);
}

function failureCode(status: number): WoztellDeliveryFailureCode {
  if (status === 429) return "retryable_rate_limit";
  if (status >= 500) return "provider_acceptance_uncertain";
  if (status >= 400 && status < 500) return "provider_client_error";
  return "provider_unclassified_failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function providerId(body: unknown): string | null {
  if (
    !isRecord(body)
    || body.ok !== 1
    || !isRecord(body.sendResult)
    || body.sendResult.ok !== 1
  ) {
    return null;
  }
  const results = body.sendResult.result;
  if (
    !Array.isArray(results)
    || !isRecord(results[0])
    || !isRecord(results[0].messageEvent)
  ) {
    return null;
  }
  const id = results[0].messageEvent.messageId;
  return typeof id === "string" && id ? id : null;
}

async function sendLive(
  credentials: LiveCredentials,
  fetchImpl: FetchLike,
  recipientId: string,
  response: readonly Record<string, unknown>[],
  requestTimeoutMs: number,
): Promise<ChannelResult> {
  // Built from AbortController and setTimeout rather than `AbortSignal.timeout`,
  // which is NOT universally present — jsdom has no such static, and a missing
  // global would throw inside the try below and be reported as
  // `retryable_network`: every live send failing as a network error, each one
  // leaving a row `PROVIDER_REFUSED_SEND` will not let staff re-take. The two
  // primitives used here exist in every runtime this ships to.
  //
  // The timer spans the body read as well as the fetch, because a response whose
  // headers arrived and whose body never does holds the send claim just as long.
  const controller = new AbortController();
  const expiry = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    let httpResponse: Response;
    try {
      httpResponse = await fetchImpl(WOZTELL_SEND_RESPONSES_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credentials.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channelId: credentials.channelId,
          recipientId,
          response,
        }),
        // The bound the send-claim lease is sized against. Without it the
        // request outlives its own claim and the reply can be delivered twice;
        // see WOZTELL_REQUEST_TIMEOUT_MS.
        signal: controller.signal,
      });
    } catch {
      // An abort arrives here too, and `retryable_network` is the honest code
      // for it: the request may have been processed and we cannot know.
      throw new WoztellDeliveryFailure("retryable_network");
    }

    if (!httpResponse.ok) {
      throw new WoztellDeliveryFailure(failureCode(httpResponse.status));
    }

    let body: unknown;
    try {
      body = await httpResponse.json();
    } catch {
      throw new WoztellDeliveryFailure("provider_unclassified_failure");
    }
    const id = providerId(body);
    if (!id) {
      throw new WoztellDeliveryFailure("provider_unclassified_failure");
    }
    return {status: "sent", providerId: id};
  } finally {
    // Cleared on every exit, or a settled send leaves a live timer holding the
    // process open for the rest of the window.
    clearTimeout(expiry);
  }
}

function receivedAtFrom(value: unknown): Date | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const epochMilliseconds = value < EPOCH_MILLISECONDS_THRESHOLD
    ? value * 1_000
    : value;
  if (
    epochMilliseconds < MIN_NUMERIC_TIMESTAMP_MS
    || epochMilliseconds > MAX_NUMERIC_TIMESTAMP_MS
  ) {
    return null;
  }
  const parsed = new Date(epochMilliseconds);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

// Programme C-1, plan O-1. THE TWO DISCRIMINATORS BELOW ARE PROVISIONAL. There
// are no Woztell credentials, no captured provider payload and no provider
// documentation in this tree; the only envelope that has ever existed here is
// `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Both new branches
// live inside this one function, and nowhere else, so correcting them against a
// real payload is a single-function change. Every branch fails closed onto the
// inert `unsupported` variant rather than emitting a half-populated event that a
// writer would then persist — and nothing here may throw, because the webhook
// route turns a throw into a 500 and the provider into a retry loop.
const DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;
const ECHO_ORIGINS = ["BOT", "MANUAL", "RELAY"] as const;

type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
type EchoOrigin = (typeof ECHO_ORIGINS)[number];

/** Deliberately a `typeof` guard rather than `String(value)`: `String(Symbol())`
 * throws, and a throw in the normaliser is a 500 on a webhook the provider then
 * retries forever. A non-string discriminator is simply not one of ours. */
function deliveryStatusFrom(value: unknown): DeliveryStatus | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return DELIVERY_STATUSES.find((candidate) => candidate === lowered) ?? null;
}

function echoOriginFrom(value: unknown): EchoOrigin | null {
  if (typeof value !== "string") return null;
  const uppered = value.trim().toUpperCase();
  return ECHO_ORIGINS.find((candidate) => candidate === uppered) ?? null;
}

function dataField(payload: Record<string, unknown>, key: string): unknown {
  return isRecord(payload.data) ? payload.data[key] : undefined;
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** C-1: the Woztell member id, stored on the conversation by Task 3. Two shapes
 * are accepted because the payload's own shape is unverified (O-1); a blank id
 * is reported as absent, since "" would otherwise be written to
 * `conversations.whatsapp_member_id` and match the next member-less sender.
 *
 * C-1 review: an OVER-LONG id is reported absent for the same reason a blank one
 * is, and this is the one hostile field that is neither rejected nor truncated.
 * It is an optional adornment on an otherwise perfectly good message, and C1
 * reads it nowhere (resolution stays number-first, per O-3) — so refusing the
 * whole inbound over it would lose a real prospect's message, which is the exact
 * harm this whole change exists to stop. Truncating is worse than dropping:
 * `contacts_whatsapp_member_unique` is a partial unique index and
 * `linkWhatsAppMemberId` is first-identity-wins, so a shortened id that collides
 * with a real one links a contact to the WRONG WhatsApp member, permanently, and
 * C2 Task 5's merge work would then be reconciling damage we invented. Absent is
 * the honest value: the link is simply not learned.
 *
 * Dropping it here is also what keeps `memberIdConflictSchema`'s own `.max(200)`
 * out of reach — `lib/ai/woztell-production.ts` only files the conflict task when
 * it still holds an id. */
function memberIdFrom(payload: Record<string, unknown>): string | null {
  const value = payload.memberId
    ?? (isRecord(payload.member) ? payload.member.id : undefined);
  const trimmed = trimmedString(value);
  if (!trimmed || trimmed.length > WOZTELL_MAX_MEMBER_ID_CHARS) return null;
  return trimmed;
}

/**
 * C-1 review. A provider message id past its bound is REFUSED, in every arm,
 * rather than truncated or stored.
 *
 * It is a key, not a label: `messages_provider_message_id_unique` indexes it,
 * `claimInbound` recognises a redelivery by it, the echo probe recognises its own
 * row by it, and `recordDeliveryStatus` reaches the row it must settle by it.
 * Truncating would collapse two distinct ids that share a prefix into one key —
 * a tick for A settling B's row, an echo for A adopting B's queued message,
 * delivery state leaking between two contacts, which is precisely the harm the
 * echo-adoption predicate already exists to prevent.
 *
 * The INBOUND arm refuses on the same bound even though nothing on that path
 * parses it (`claimInbound` takes no zod, and `messages.provider_message_id` is
 * an unbounded `text` column). One bound, one behaviour, because the alternative
 * is worse than either: store an inbound under an id the tick and echo lanes
 * would then refuse, and it is a message that can never be settled, never
 * matched and — past roughly 2 700 bytes, where a btree entry stops fitting —
 * cannot be inserted at all, which is a 500 and the retry loop again.
 */
const REJECTED_MESSAGE_ID = {
  kind: "rejected",
  reason: "provider_message_id_too_long",
} as const;

function providerMessageIdTooLong(providerMessageId: string): boolean {
  return providerMessageId.length > WOZTELL_MAX_PROVIDER_MESSAGE_ID_CHARS;
}

function normalizedInbound(payload: unknown): NormalizedInbound {
  if (!isRecord(payload)) {
    return {kind: "unsupported", sender: null, text: null, intent: null};
  }
  const sender = typeof payload.from === "string" ? payload.from : null;
  const unsupported = {
    kind: "unsupported",
    sender,
    text: null,
    intent: null,
  } as const;

  if (payload.type === "TEXT") {
    const text = trimmedString(dataField(payload, "text"));
    const providerMessageId = trimmedString(payload.messageId);
    const receivedAt = receivedAtFrom(payload.timestamp);
    if (!sender || !text || !providerMessageId || receivedAt === null) {
      return unsupported;
    }
    if (providerMessageIdTooLong(providerMessageId)) return REJECTED_MESSAGE_ID;
    // NOTE what is deliberately NOT bounded here: `text`. The inbound body is
    // written by `claimInbound` into `messages.content`, an unbounded `text`
    // column, through a statement that parses nothing — so there is no bound on
    // this path to fail closed against, and inventing one would truncate or drop
    // a real person's message for no reason. `readBoundedText` in the route caps
    // the whole body at 64 KB, which is the only limit that applies. The echo's
    // body is a different story, because its repository does parse it.
    return {
      kind: "message",
      sender,
      text,
      // D-7 / plan S-11: the vocabulary is a closed token list in
      // lib/whatsapp/opt-out.ts, not the `toUpperCase() === "STOP"` test that
      // used to live here and missed "Stop.", "unsubscribe" and 退訂.
      intent: isOptOutText(text) ? "opt_out" : null,
      providerMessageId,
      receivedAt,
      whatsappMemberId: memberIdFrom(payload),
    };
  }

  if (payload.type === "MESSAGE_STATUS") {
    const providerMessageId = trimmedString(payload.messageId);
    const status = deliveryStatusFrom(dataField(payload, "status"));
    const occurredAt = receivedAtFrom(payload.timestamp);
    if (!providerMessageId || status === null || occurredAt === null) {
      return unsupported;
    }
    if (providerMessageIdTooLong(providerMessageId)) return REJECTED_MESSAGE_ID;
    // TRUNCATED, not rejected, and it is the opposite call from the id above for
    // the opposite reason. `messages.error_code` is diagnostic prose in an
    // unindexed `text` column that nothing joins or matches on: `inbox.ts`'s
    // `refusedSendPredicate` compares it against the ADAPTER's own failure codes
    // and only on rows with no provider id, which a tick by definition has. So
    // the only question is keep the tick or lose it — and losing it is the
    // failure plan O-1 already warns about, where the outbound row stays `sent`
    // for ever and nobody learns the send failed. Worse, the error code rides on
    // the `failed` tick, so a reject rule here would discard exactly the
    // failures. A 200-character prefix is still the part a person reads first.
    const errorCode = trimmedString(dataField(payload, "errorCode"))
      .slice(0, WOZTELL_MAX_ERROR_CODE_CHARS);
    return {
      kind: "delivery_status",
      providerMessageId,
      status,
      errorCode: errorCode ? errorCode : null,
      occurredAt,
    };
  }

  if (payload.type === "OUTBOUND") {
    const recipient = trimmedString(payload.to);
    const text = trimmedString(dataField(payload, "text"));
    const providerMessageId = trimmedString(payload.messageId);
    const origin = echoOriginFrom(payload.origin);
    const sentAt = receivedAtFrom(payload.timestamp);
    if (!recipient || !text || !providerMessageId || origin === null || sentAt === null) {
      return unsupported;
    }
    if (providerMessageIdTooLong(providerMessageId)) return REJECTED_MESSAGE_ID;
    // REJECTED, never truncated. WhatsApp caps a text body at 4096 characters,
    // so 20 000 is already five times anything real and a body past it is not a
    // message we sent. Truncating would be actively harmful twice: the adopt
    // statement in `recordOutboundEcho` joins on `candidate.content = <text>`,
    // so a shortened body can never match the queued row it belongs to and
    // inserts a SECOND outbound row instead — leaving the staff row `queued`,
    // which is the re-send state — and a shortened body in the transcript is a
    // falsified record staff then reply from.
    if (text.length > WOZTELL_MAX_ECHO_TEXT_CHARS) {
      return {kind: "rejected", reason: "provider_text_too_long"};
    }
    return {
      kind: "outbound_echo",
      recipient,
      text,
      providerMessageId,
      origin,
      sentAt,
    };
  }

  return unsupported;
}

function validWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null,
): boolean {
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature ?? "", "utf8");
  const fixedLengthCandidate = Buffer.alloc(expectedBytes.length);
  receivedBytes.copy(
    fixedLengthCandidate,
    0,
    0,
    fixedLengthCandidate.length,
  );
  const matched = timingSafeEqual(expectedBytes, fixedLengthCandidate);
  return receivedBytes.length === expectedBytes.length && matched;
}

export function createWoztellAdapter(
  env: WoztellEnvironment,
  fetchImpl: FetchLike = fetch,
  now: () => Date = () => new Date(),
  // Injectable only so the abort path can be exercised by a test that finishes.
  // Every production construction site takes the default: a per-call timeout is
  // a bound on how long one send may hold its claim, not a tuning knob.
  requestTimeoutMs: number = WOZTELL_REQUEST_TIMEOUT_MS,
): ChannelAdapter {
  const credentials = liveCredentials(env);
  const webhookSecret = nonblank(env.WOZTELL_WEBHOOK_SECRET);

  async function send(
    recipient: WhatsAppRecipient,
    idempotencyKey: string,
    response: readonly Record<string, unknown>[],
  ): Promise<ChannelResult> {
    const recipientId = recipientNumber(recipient);
    if (!recipientId) {
      return {status: "skipped", reason: "recipient_ineligible"};
    }
    if (!credentials) {
      return {status: "sent", providerId: `mock:${idempotencyKey}`};
    }
    return sendLive(credentials, fetchImpl, recipientId, response, requestTimeoutMs);
  }

  return {
    sendSessionMessage(input: SessionMessageInput) {
      const lastCustomerMessageAt = input.lastCustomerMessageAt;
      if (
        !(lastCustomerMessageAt instanceof Date)
        || !Number.isFinite(lastCustomerMessageAt.getTime())
        || now().getTime() - lastCustomerMessageAt.getTime()
          > CUSTOMER_SERVICE_WINDOW_MS
      ) {
        return Promise.resolve({
          status: "blocked",
          reason: "outside_customer_service_window",
        });
      }
      return send(input, input.idempotencyKey, [{
        type: "TEXT",
        text: input.text,
      }]);
    },
    sendTemplateMessage(input: TemplateMessageInput) {
      const template = WHATSAPP_TEMPLATES[input.template];
      return send(input, input.idempotencyKey, [{
        type: "TEMPLATE",
        elementName: template.name,
        languageCode: template.languageCode,
        components: [{
          type: "body",
          parameters: template.variables.map((key) => ({
            type: "text",
            text: input.variables[key] ?? "",
          })),
        }],
      }]);
    },
    normalizeInbound: normalizedInbound,
    verifyWebhook(rawBody, signature) {
      return validWebhookSignature(rawBody, signature, webhookSecret);
    },
  };
}
