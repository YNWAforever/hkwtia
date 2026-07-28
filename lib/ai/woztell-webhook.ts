import "server-only";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {
  ChannelAdapter,
  NormalizedInbound,
} from "@/lib/channels/types";
import {normalizeWhatsAppNumber} from "@/lib/channels/woztell";
import type {ConversationOwner} from "@/lib/db/repos/conversations";

export type WoztellProfile = Readonly<{
  id: string;
  displayName: string;
  locale: "en" | "zh-HK";
  whatsappOptIn: boolean;
}>;

export type WoztellClaimState =
  | "claimed"
  | "running"
  | "reply_ready"
  | "completed";

export function decideWoztellClaimState(input: Readonly<{
  state: WoztellClaimState;
  leaseUntil: Date | null;
  now: Date;
}>): "resume" | "duplicate" {
  if (input.state === "completed") return "duplicate";
  if (
    input.leaseUntil
    && Number.isFinite(input.leaseUntil.getTime())
    && input.leaseUntil.getTime() > input.now.getTime()
  ) {
    return "duplicate";
  }
  return "resume";
}

export type WoztellInboundClaim =
  | Readonly<{status: "duplicate"}>
  | Readonly<{
    status: "accepted";
    conversationId: string;
    owner: ConversationOwner;
    profileId: string | null;
    locale: "en" | "zh-HK";
    memberName: string;
    whatsappOptIn: boolean;
    pendingReply?: string;
  }>;

export type WoztellInboundClaimInput = Readonly<{
  owner: ConversationOwner;
  profileId: string | null;
  locale: "en" | "zh-HK";
  memberName: string;
  whatsappOptIn: boolean;
  sender: string;
  providerMessageId: string;
  receivedAt: Date;
  content: string;
  channel: "whatsapp";
}>;

export type WoztellConciergeTurnInput = Readonly<{
  owner: ConversationOwner;
  profileId: string | null;
  conversationId: string;
  providerMessageId: string;
  message: string;
  locale: "en" | "zh-HK";
  trigger: "whatsapp";
  inboundMessagePersisted: true;
}>;

export type WoztellConciergeTurn = Readonly<{
  conversationId: string;
  runId: string;
  events: AsyncIterable<Readonly<{
    event: string;
    data: Readonly<Record<string, unknown>>;
  }>>;
  cancel: () => Promise<void>;
}>;

export type WoztellWebhookProcessorDependencies = Readonly<{
  channel: ChannelAdapter;
  resolveProfile: (normalizedSender: string) => Promise<WoztellProfile | null>;
  claimInbound: (
    input: WoztellInboundClaimInput,
  ) => Promise<WoztellInboundClaim>;
  markRunOwned?: (
    providerMessageId: string,
    leaseUntil: Date,
  ) => Promise<void>;
  markReplyReady?: (
    providerMessageId: string,
    reply: string,
    leaseUntil: Date,
  ) => Promise<void>;
  markCompleted?: (providerMessageId: string) => Promise<void>;
  setWhatsappOptIn: (profileId: string, optedIn: boolean) => Promise<void>;
  concierge: Readonly<{
    startTurn(input: WoztellConciergeTurnInput): Promise<WoztellConciergeTurn>;
  }>;
  escalate: (input: Readonly<{
    conversationId: string;
    profileId: string | null;
    locale: "en" | "zh-HK";
    reason: "approved_template_unavailable" | "channel_delivery_failed";
  }>) => Promise<void>;
  anonymousOwnerHash: (normalizedSender: string) => string;
  approvedTemplateKeys: ReadonlySet<WhatsAppTemplateKey>;
  supportUrl: string;
  now?: () => Date;
}>;

export type WoztellProcessResult =
  | Readonly<{status: "accepted"}>
  | Readonly<{status: "duplicate"}>
  | Readonly<{status: "ignored"}>
  | Readonly<{status: "opted_out"}>
  | Readonly<{status: "escalated"}>;

const EFFECT_LEASE_MS = 5 * 60 * 1_000;

function localeFor(
  text: string,
  profile: WoztellProfile | null,
): "en" | "zh-HK" {
  if (profile) return profile.locale;
  return /[\u3400-\u9fff]/u.test(text) ? "zh-HK" : "en";
}

function templateFor(locale: "en" | "zh-HK"): WhatsAppTemplateKey {
  return locale === "zh-HK"
    ? "concierge_follow_up_zh_hk"
    : "concierge_follow_up_en";
}

async function responseText(turn: WoztellConciergeTurn): Promise<string> {
  let text = "";
  for await (const event of turn.events) {
    if (event.event === "delta" && typeof event.data.text === "string") {
      text += event.data.text;
    }
  }
  return text.trim();
}

function ownerFor(
  profile: WoztellProfile | null,
  normalizedSender: string,
  dependencies: WoztellWebhookProcessorDependencies,
): ConversationOwner {
  return profile
    ? {kind: "profile", profileId: profile.id}
    : {
      kind: "anonymous",
      anonymousOwnerHash: dependencies.anonymousOwnerHash(normalizedSender),
    };
}

export function createWoztellWebhookProcessor(
  dependencies: WoztellWebhookProcessorDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const leaseUntil = () => new Date(now().getTime() + EFFECT_LEASE_MS);
  return Object.freeze({
    async process(payload: unknown): Promise<WoztellProcessResult> {
      const normalized: NormalizedInbound =
        dependencies.channel.normalizeInbound(payload);
      if (normalized.kind === "unsupported") return {status: "ignored"};

      const sender = normalizeWhatsAppNumber(normalized.sender);
      if (!sender) return {status: "ignored"};
      const profile = await dependencies.resolveProfile(sender);
      const locale = localeFor(normalized.text, profile);
      const owner = ownerFor(profile, sender, dependencies);
      const claim = await dependencies.claimInbound({
        owner,
        profileId: profile?.id ?? null,
        locale,
        memberName: profile?.displayName ?? "Member",
        whatsappOptIn: profile?.whatsappOptIn ?? true,
        sender,
        providerMessageId: normalized.providerMessageId,
        receivedAt: normalized.receivedAt,
        content: normalized.text,
        channel: "whatsapp",
      });
      if (claim.status === "duplicate") return {status: "duplicate"};

      if (normalized.intent === "opt_out") {
        if (claim.profileId) {
          await dependencies.setWhatsappOptIn(claim.profileId, false);
        }
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "opted_out"};
      }

      let text = claim.pendingReply;
      if (text === undefined) {
        await dependencies.markRunOwned?.(
          normalized.providerMessageId,
          leaseUntil(),
        );
        const turn = await dependencies.concierge.startTurn({
          owner: claim.owner,
          profileId: claim.profileId,
          conversationId: claim.conversationId,
          providerMessageId: normalized.providerMessageId,
          message: normalized.text,
          locale: claim.locale,
          trigger: "whatsapp",
          inboundMessagePersisted: true,
        });
        text = await responseText(turn);
        if (!text) {
          await dependencies.markCompleted?.(normalized.providerMessageId);
          return {status: "accepted"};
        }
        await dependencies.markReplyReady?.(
          normalized.providerMessageId,
          text,
          leaseUntil(),
        );
      }

      const session = await dependencies.channel.sendSessionMessage({
        whatsappOptIn: claim.whatsappOptIn,
        whatsappNumber: sender,
        text,
        idempotencyKey: `concierge:${normalized.providerMessageId}:session`,
        lastCustomerMessageAt: normalized.receivedAt,
      });
      if (session.status !== "blocked") {
        if (session.status === "skipped") {
          await dependencies.escalate({
            conversationId: claim.conversationId,
            profileId: claim.profileId,
            locale: claim.locale,
            reason: "channel_delivery_failed",
          });
          await dependencies.markCompleted?.(normalized.providerMessageId);
          return {status: "escalated"};
        }
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "accepted"};
      }

      const template = templateFor(claim.locale);
      if (!dependencies.approvedTemplateKeys.has(template)) {
        await dependencies.escalate({
          conversationId: claim.conversationId,
          profileId: claim.profileId,
          locale: claim.locale,
          reason: "approved_template_unavailable",
        });
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "escalated"};
      }
      const templateResult = await dependencies.channel.sendTemplateMessage({
        whatsappOptIn: claim.whatsappOptIn,
        whatsappNumber: sender,
        template,
        variables: {
          memberName: claim.memberName,
          supportUrl: dependencies.supportUrl,
        },
        idempotencyKey: `concierge:${normalized.providerMessageId}:template`,
      });
      if (templateResult.status !== "sent") {
        await dependencies.escalate({
          conversationId: claim.conversationId,
          profileId: claim.profileId,
          locale: claim.locale,
          reason: "channel_delivery_failed",
        });
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "escalated"};
      }
      await dependencies.markCompleted?.(normalized.providerMessageId);
      return {status: "accepted"};
    },
  });
}
