import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
import {isOptOutText} from "@/lib/whatsapp/opt-out";

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
): Promise<ChannelResult> {
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
    });
  } catch {
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
 * `conversations.whatsapp_member_id` and match the next member-less sender. */
function memberIdFrom(payload: Record<string, unknown>): string | null {
  const value = payload.memberId
    ?? (isRecord(payload.member) ? payload.member.id : undefined);
  const trimmed = trimmedString(value);
  return trimmed ? trimmed : null;
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
    const errorCode = trimmedString(dataField(payload, "errorCode"));
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
    return sendLive(credentials, fetchImpl, recipientId, response);
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
