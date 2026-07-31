import "server-only";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {ChannelAdapter} from "@/lib/channels/types";

export type WoztellDeliveryKind = "session" | "template";
export type WoztellDeliveryReservation =
  | Readonly<{status: "send"; deliveryId: string}>
  | Readonly<{status: "sent"; deliveryId: string; providerId?: string}>
  | Readonly<{status: "uncertain"; deliveryId: string}>
  | Readonly<{status: "blocked"; deliveryId: string}>
  | Readonly<{status: "skipped"; deliveryId: string}>;

export type WoztellDeliveryDependencies = Readonly<{
  channel: ChannelAdapter;
  reserveDelivery?: (input: Readonly<{
    providerMessageId: string;
    kind: WoztellDeliveryKind;
    idempotencyKey: string;
  }>) => Promise<WoztellDeliveryReservation>;
  markDeliverySent?: (
    deliveryId: string,
    providerId: string,
  ) => Promise<void>;
  markDeliveryRetryable?: (deliveryId: string) => Promise<void>;
  markDeliveryUncertain?: (deliveryId: string) => Promise<void>;
  markDeliveryBlocked?: (deliveryId: string) => Promise<void>;
  markDeliverySkipped?: (deliveryId: string) => Promise<void>;
  approvedTemplateKeys: ReadonlySet<WhatsAppTemplateKey>;
  supportUrl: string;
}>;

export type WoztellDeliveryInput = Readonly<{
  providerMessageId: string;
  sender: string;
  receivedAt: Date;
  text: string;
  locale: "en" | "zh-HK";
  memberName: string;
  whatsappOptIn: boolean;
  complete: () => Promise<void>;
  escalate: (
    reason:
      | "approved_template_unavailable"
      | "channel_delivery_failed"
      | "channel_delivery_uncertain",
  ) => Promise<void>;
}>;

export type WoztellDeliveryResult =
  | Readonly<{status: "accepted"}>
  | Readonly<{status: "escalated"}>;

function templateFor(locale: "en" | "zh-HK"): WhatsAppTemplateKey {
  return locale === "zh-HK"
    ? "concierge_follow_up_zh_hk"
    : "concierge_follow_up_en";
}

async function reservation(
  dependencies: WoztellDeliveryDependencies,
  providerMessageId: string,
  kind: WoztellDeliveryKind,
  idempotencyKey: string,
): Promise<WoztellDeliveryReservation> {
  if (!dependencies.reserveDelivery) {
    return {status: "send", deliveryId: idempotencyKey};
  }
  return dependencies.reserveDelivery({
    providerMessageId,
    kind,
    idempotencyKey,
  });
}

async function escalateTerminal(
  input: WoztellDeliveryInput,
  reason:
    | "approved_template_unavailable"
    | "channel_delivery_failed"
    | "channel_delivery_uncertain",
): Promise<WoztellDeliveryResult> {
  await input.escalate(reason);
  await input.complete();
  return {status: "escalated"};
}

async function handleDeliveryError(
  error: unknown,
  deliveryId: string,
  input: WoztellDeliveryInput,
  dependencies: WoztellDeliveryDependencies,
): Promise<WoztellDeliveryResult> {
  if (!dependencies.reserveDelivery) throw error;
  await dependencies.markDeliveryUncertain?.(deliveryId);
  return escalateTerminal(input, "channel_delivery_uncertain");
}

export async function deliverWoztellReply(
  input: WoztellDeliveryInput,
  dependencies: WoztellDeliveryDependencies,
): Promise<WoztellDeliveryResult> {
  const sessionKey = `concierge:${input.providerMessageId}:session`;
  const sessionReservation = await reservation(
    dependencies,
    input.providerMessageId,
    "session",
    sessionKey,
  );
  if (sessionReservation.status === "sent") {
    await input.complete();
    return {status: "accepted"};
  }
  if (sessionReservation.status === "uncertain") {
    return escalateTerminal(input, "channel_delivery_uncertain");
  }
  if (sessionReservation.status === "skipped") {
    return escalateTerminal(input, "channel_delivery_failed");
  }

  let sessionBlocked = sessionReservation.status === "blocked";
  if (sessionReservation.status === "send") {
    let session;
    try {
      session = await dependencies.channel.sendSessionMessage({
        whatsappOptIn: input.whatsappOptIn,
        whatsappNumber: input.sender,
        text: input.text,
        idempotencyKey: sessionKey,
        lastCustomerMessageAt: input.receivedAt,
      });
    } catch (error) {
      return handleDeliveryError(
        error,
        sessionReservation.deliveryId,
        input,
        dependencies,
      );
    }
    if (session.status === "sent") {
      await dependencies.markDeliverySent?.(
        sessionReservation.deliveryId,
        session.providerId,
      );
      await input.complete();
      return {status: "accepted"};
    }
    if (session.status === "skipped") {
      await dependencies.markDeliverySkipped?.(
        sessionReservation.deliveryId,
      );
      return escalateTerminal(input, "channel_delivery_failed");
    }
    await dependencies.markDeliveryBlocked?.(sessionReservation.deliveryId);
    sessionBlocked = true;
  }

  if (!sessionBlocked) {
    throw new Error("INVALID_WOZTELL_SESSION_DELIVERY_STATE");
  }
  const template = templateFor(input.locale);
  if (!dependencies.approvedTemplateKeys.has(template)) {
    return escalateTerminal(input, "approved_template_unavailable");
  }
  const templateKey = `concierge:${input.providerMessageId}:template`;
  const templateReservation = await reservation(
    dependencies,
    input.providerMessageId,
    "template",
    templateKey,
  );
  if (templateReservation.status === "sent") {
    await input.complete();
    return {status: "accepted"};
  }
  if (templateReservation.status === "uncertain") {
    return escalateTerminal(input, "channel_delivery_uncertain");
  }
  if (
    templateReservation.status === "skipped"
    || templateReservation.status === "blocked"
  ) {
    return escalateTerminal(input, "channel_delivery_failed");
  }

  let templateResult;
  try {
    templateResult = await dependencies.channel.sendTemplateMessage({
      whatsappOptIn: input.whatsappOptIn,
      whatsappNumber: input.sender,
      template,
      variables: {
        memberName: input.memberName,
        supportUrl: dependencies.supportUrl,
      },
      idempotencyKey: templateKey,
    });
  } catch (error) {
    return handleDeliveryError(
      error,
      templateReservation.deliveryId,
      input,
      dependencies,
    );
  }
  if (templateResult.status === "skipped") {
    await dependencies.markDeliverySkipped?.(templateReservation.deliveryId);
    return escalateTerminal(input, "channel_delivery_failed");
  }
  await dependencies.markDeliverySent?.(
    templateReservation.deliveryId,
    templateResult.providerId,
  );
  await input.complete();
  return {status: "accepted"};
}
