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
  }>;

export interface ChannelAdapter {
  sendSessionMessage(input: SessionMessageInput): Promise<SessionChannelResult>;
  sendTemplateMessage(input: TemplateMessageInput): Promise<ChannelResult>;
  normalizeInbound(payload: unknown): NormalizedInbound;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}
