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

export type WoztellEnvironment = Readonly<{
  WOZTELL_API_TOKEN?: string;
  WOZTELL_CHANNEL_ID?: string;
  WOZTELL_WEBHOOK_SECRET?: string;
}>;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type WoztellDeliveryFailureCode =
  | "retryable_network"
  | "retryable_rate_limit"
  | "retryable_server"
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
  if (status >= 500) return "retryable_server";
  if (status >= 400 && status < 500) return "provider_client_error";
  return "provider_unclassified_failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function providerId(body: unknown): string | null {
  if (!isRecord(body) || body.ok !== 1 || !isRecord(body.sendResult) || body.sendResult.ok !== 1) return null;
  const results = body.sendResult.result;
  if (!Array.isArray(results) || !isRecord(results[0]) || !isRecord(results[0].messageEvent)) return null;
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
      body: JSON.stringify({channelId: credentials.channelId, recipientId, response}),
    });
  } catch {
    throw new WoztellDeliveryFailure("retryable_network");
  }

  if (!httpResponse.ok) throw new WoztellDeliveryFailure(failureCode(httpResponse.status));

  let body: unknown;
  try {
    body = await httpResponse.json();
  } catch {
    throw new WoztellDeliveryFailure("provider_unclassified_failure");
  }
  const id = providerId(body);
  if (!id) throw new WoztellDeliveryFailure("provider_unclassified_failure");
  return {status: "sent", providerId: id};
}

function normalizedInbound(payload: unknown): NormalizedInbound {
  if (!isRecord(payload)) return {kind: "unsupported", sender: null, text: null, intent: null};
  const sender = typeof payload.from === "string" ? payload.from : null;
  const text = isRecord(payload.data) && typeof payload.data.text === "string" ? payload.data.text.trim() : null;
  if (payload.type !== "TEXT" || text === null) return {kind: "unsupported", sender, text: null, intent: null};
  return {
    kind: "message",
    sender,
    text,
    intent: text.toUpperCase() === "STOP" || text === "\u53d6\u6d88" ? "opt_out" : null,
  };
}

function validWebhookSignature(rawBody: string, signature: string | null, secret: string | null): boolean {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature ?? "", "utf8");
  const fixedLengthCandidate = Buffer.alloc(expectedBytes.length);
  receivedBytes.copy(fixedLengthCandidate, 0, 0, fixedLengthCandidate.length);
  const matched = timingSafeEqual(expectedBytes, fixedLengthCandidate);
  return receivedBytes.length === expectedBytes.length && matched;
}

export function createWoztellAdapter(env: WoztellEnvironment, fetchImpl: FetchLike = fetch): ChannelAdapter {
  const credentials = liveCredentials(env);
  const webhookSecret = nonblank(env.WOZTELL_WEBHOOK_SECRET);

  async function send(
    recipient: WhatsAppRecipient,
    idempotencyKey: string,
    response: readonly Record<string, unknown>[],
  ): Promise<ChannelResult> {
    const recipientId = recipientNumber(recipient);
    if (!recipientId) return {status: "skipped", reason: "recipient_ineligible"};
    if (!credentials) return {status: "sent", providerId: `mock:${idempotencyKey}`};
    return sendLive(credentials, fetchImpl, recipientId, response);
  }

  return {
    sendSessionMessage(input: SessionMessageInput) {
      return send(input, input.idempotencyKey, [{type: "TEXT", text: input.text}]);
    },
    sendTemplateMessage(input: TemplateMessageInput) {
      const template = WHATSAPP_TEMPLATES[input.template];
      return send(input, input.idempotencyKey, [{
        type: "TEMPLATE",
        elementName: template.name,
        languageCode: template.languageCode,
        components: [{
          type: "body",
          parameters: template.variables.map((key) => ({type: "text", text: input.variables[key] ?? ""})),
        }],
      }]);
    },
    normalizeInbound: normalizedInbound,
    verifyWebhook(rawBody, signature) {
      return validWebhookSignature(rawBody, signature, webhookSecret);
    },
  };
}
