import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import type {
  ChannelAdapter,
  ChannelResult,
  NormalizedInbound,
  SessionMessageInput,
  TemplateMessageInput,
  WhatsAppRecipient,
} from "@/lib/channels/types";

const WOZTELL_SEND_RESPONSES_URL = "https://bot.api.woztell.com/sendResponses";
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;
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

function normalizedInbound(payload: unknown): NormalizedInbound {
  if (!isRecord(payload)) {
    return {kind: "unsupported", sender: null, text: null, intent: null};
  }
  const sender = typeof payload.from === "string" ? payload.from : null;
  const text = isRecord(payload.data) && typeof payload.data.text === "string"
    ? payload.data.text.trim()
    : null;
  const providerMessageId = typeof payload.messageId === "string"
    ? payload.messageId.trim()
    : "";
  const receivedAt = receivedAtFrom(payload.timestamp);
  if (
    payload.type !== "TEXT"
    || !sender
    || !text
    || !providerMessageId
    || receivedAt === null
  ) {
    return {kind: "unsupported", sender, text: null, intent: null};
  }
  return {
    kind: "message",
    sender,
    text,
    intent: text.toUpperCase() === "STOP" || text === "\u53d6\u6d88"
      ? "opt_out"
      : null,
    providerMessageId,
    receivedAt,
  };
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

export function normalizeWhatsAppNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
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
