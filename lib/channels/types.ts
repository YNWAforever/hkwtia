import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";

export type WhatsAppRecipient = Readonly<{
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
}>;

export type SessionMessageInput = WhatsAppRecipient & Readonly<{
  text: string;
  idempotencyKey: string;
}>;

export type TemplateMessageInput = WhatsAppRecipient & Readonly<{
  template: WhatsAppTemplateKey;
  variables: Readonly<Record<string, string>>;
  idempotencyKey: string;
}>;

export type ChannelResult =
  | Readonly<{status: "sent"; providerId: string}>
  | Readonly<{status: "skipped"; reason: "recipient_ineligible"}>;

export type NormalizedInbound = Readonly<{
  kind: "message" | "unsupported";
  sender: string | null;
  text: string | null;
  intent: "opt_out" | null;
}>;

export interface ChannelAdapter {
  sendSessionMessage(input: SessionMessageInput): Promise<ChannelResult>;
  sendTemplateMessage(input: TemplateMessageInput): Promise<ChannelResult>;
  normalizeInbound(payload: unknown): NormalizedInbound;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}
