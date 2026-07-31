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

export type NormalizedInbound =
  | Readonly<{
    kind: "message";
    sender: string;
    text: string;
    intent: "opt_out" | null;
    providerMessageId: string;
    receivedAt: Date;
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
