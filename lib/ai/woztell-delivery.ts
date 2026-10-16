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
  /**
   * C-1 Task 10. The jsonb outbox records the provider id against the INBOUND
   * row, so until this existed no outbound row anywhere carried one and
   * `recordDeliveryStatus` — which reaches a row by its provider id — matched
   * nothing for every bot reply. Optional, like the rest of this bag;
   * `tests/unit/woztell-production-wiring.test.ts` is what makes "optional" mean
   * "the fixtures stay green" rather than "production forgot it".
   */
  stampOutbound?: (input: Readonly<{
    inboundProviderMessageId: string;
    providerId: string;
  }>) => Promise<Readonly<{stamped: boolean}>>;
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

/**
 * S-5: a stamp applied AFTER the outbox has decided, never a second decision.
 *
 * The `.catch` is deliberate and this is its reason: `markDeliverySent` is the
 * ledger the four pinned outbox integration tests exercise and the thing that
 * decides whether the concierge may send this reply again. The stamp is
 * bookkeeping on the outbound row so the inbox can show a tick. If it fails we
 * lose the tick; if it were allowed to throw here it would turn a message the
 * member has already received into `channel_delivery_uncertain` and a staff
 * escalation, and — worse — leave the outbox saying "accepted" while the caller
 * believes the send failed.
 */
async function stampOutboundRow(
  dependencies: WoztellDeliveryDependencies,
  inboundProviderMessageId: string,
  providerId: string,
): Promise<void> {
  await dependencies.stampOutbound?.({
    inboundProviderMessageId,
    providerId,
  }).catch(() => undefined);
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
      await stampOutboundRow(
        dependencies,
        input.providerMessageId,
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
  await stampOutboundRow(
    dependencies,
    input.providerMessageId,
    templateResult.providerId,
  );
  await input.complete();
  return {status: "accepted"};
}
