import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";

export type WhatsAppRecipient = Readonly<{
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
}>;

export type SessionMessageInput = WhatsAppRecipient & Readonly<{
  text: string;
  idempotencyKey: string;
  lastCustomerMessageAt: Date;
}>;

export type TemplateMessageInput = WhatsAppRecipient & Readonly<{
  template: WhatsAppTemplateKey;
  variables: Readonly<Record<string, string>>;
  idempotencyKey: string;
}>;

export type ChannelResult =
  | Readonly<{status: "sent"; providerId: string}>
  | Readonly<{status: "skipped"; reason: "recipient_ineligible"}>;

export type SessionChannelResult =
  | ChannelResult
  | Readonly<{
    status: "blocked";
    reason: "outside_customer_service_window";
  }>;

// Programme C-1. The webhook used to answer 202 {"ignored"} to everything that
// was not an inbound TEXT, so a delivery tick and an echo of our own outbound
// message were indistinguishable from a malformed payload. The variants below
// are added as NEW ARMS, never as optional fields on `message`: an arm that a
// reader has not handled is a type error, whereas a field that is sometimes
// absent is a runtime surprise.
export type NormalizedInbound =
  | Readonly<{
    kind: "message";
    sender: string;
    text: string;
    intent: "opt_out" | null;
    providerMessageId: string;
    receivedAt: Date;
    /** C-1: the Woztell member id, resolved before the phone number. Null when
     * the payload does not carry one — every payload shape before Phase C. */
    whatsappMemberId: string | null;
  }>
  | Readonly<{
    kind: "delivery_status";
    /** The id of the OUTBOUND message this status is about. */
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    errorCode: string | null;
    occurredAt: Date;
  }>
  | Readonly<{
    kind: "outbound_echo";
    recipient: string;
    text: string;
    providerMessageId: string;
    origin: "BOT" | "MANUAL" | "RELAY";
    sentAt: Date;
  }>
  | Readonly<{
    kind: "unsupported";
    sender: string | null;
    text: null;
    intent: null;
  }>
  /**
   * C-1 review. A payload we DID recognise and are refusing anyway, because one
   * of its provider-supplied strings is past the bound the repositories enforce
   * (`lib/whatsapp/provider-field-limits.ts`). Its own arm rather than a fifth
   * `unsupported` literal for two reasons: the two existing `unsupported`
   * literals are pinned byte-identical by `tests/unit/woztell-review-gaps.test.ts`
   * and adding a field would break them, and "we do not handle this kind of
   * event" is a different fact from "we refused a hostile field" — the webhook's
   * response body is this subsystem's only observability, and at C-9 nobody can
   * act on a diagnosis that conflates the two. That is the same reasoning that
   * removed the bare `{status: "ignored"}` arm in Task 4.
   *
   * The reason names the FIELD CLASS, never the value: a provider body carries
   * credentials and PII and this layer deliberately logs none of it.
   */
  | Readonly<{
    kind: "rejected";
    reason: "provider_message_id_too_long" | "provider_text_too_long";
  }>;

export interface ChannelAdapter {
  sendSessionMessage(input: SessionMessageInput): Promise<SessionChannelResult>;
  sendTemplateMessage(input: TemplateMessageInput): Promise<ChannelResult>;
  normalizeInbound(payload: unknown): NormalizedInbound;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}
