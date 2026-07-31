import {createHmac} from "node:crypto";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";

export const WOZTELL_ACCEPTANCE_AUTHORIZATION =
  "I_ACCEPT_WOZTELL_ACCEPTANCE_SIDE_EFFECTS";
export const WOZTELL_ACCEPTANCE_TARGET_KIND = "sandbox";

type AcceptanceEnvironment = Readonly<
  Record<string, string | undefined>
>;

function required(
  environment: AcceptanceEnvironment,
  key: string,
): string | null {
  const value = environment[key]?.trim();
  return value ? value : null;
}

export function isWoztellAcceptanceEnabled(
  environment: AcceptanceEnvironment,
): boolean {
  return environment.RUN_LIVE_WOZTELL_ACCEPTANCE === "1"
    && environment.WOZTELL_ACCEPTANCE_AUTHORIZED
      === WOZTELL_ACCEPTANCE_AUTHORIZATION
    && environment.WOZTELL_ACCEPTANCE_ALLOW_DELIVERY === "1"
    && environment.WOZTELL_ACCEPTANCE_TARGET_KIND
      === WOZTELL_ACCEPTANCE_TARGET_KIND;
}

export function requireWoztellAcceptanceAuthorization(
  environment: AcceptanceEnvironment,
) {
  if (environment.RUN_LIVE_WOZTELL_ACCEPTANCE !== "1") {
    throw new Error("WOZTELL_ACCEPTANCE_LIVE_FLAG_REQUIRED");
  }
  if (
    environment.WOZTELL_ACCEPTANCE_AUTHORIZED
    !== WOZTELL_ACCEPTANCE_AUTHORIZATION
  ) {
    throw new Error("WOZTELL_ACCEPTANCE_AUTHORIZATION_REQUIRED");
  }

  const apiToken = required(environment, "WOZTELL_ACCEPTANCE_API_TOKEN");
  const channelId = required(environment, "WOZTELL_ACCEPTANCE_CHANNEL_ID");
  const webhookSecret = required(
    environment,
    "WOZTELL_ACCEPTANCE_WEBHOOK_SECRET",
  );
  const recipientId = required(
    environment,
    "WOZTELL_ACCEPTANCE_RECIPIENT_ID",
  );
  if (!apiToken || !channelId || !webhookSecret || !recipientId) {
    throw new Error("WOZTELL_ACCEPTANCE_CREDENTIALS_REQUIRED");
  }
  if (environment.WOZTELL_ACCEPTANCE_ALLOW_DELIVERY !== "1") {
    throw new Error("WOZTELL_ACCEPTANCE_DELIVERY_FLAG_REQUIRED");
  }
  if (
    environment.WOZTELL_ACCEPTANCE_TARGET_KIND
    !== WOZTELL_ACCEPTANCE_TARGET_KIND
  ) {
    throw new Error("WOZTELL_ACCEPTANCE_SANDBOX_TARGET_REQUIRED");
  }
  const expectedHost = required(
    environment,
    "WOZTELL_ACCEPTANCE_EXPECTED_API_HOST",
  );
  if (expectedHost !== "bot.api.woztell.com") {
    throw new Error("WOZTELL_ACCEPTANCE_API_HOST_MISMATCH");
  }
  if (
    environment.WOZTELL_API_TOKEN === apiToken
    || environment.WOZTELL_CHANNEL_ID === channelId
  ) {
    throw new Error("WOZTELL_ACCEPTANCE_RUNTIME_CREDENTIAL_REUSE_FORBIDDEN");
  }
  if (!/^\d{8,15}$/u.test(recipientId)) {
    throw new Error("WOZTELL_ACCEPTANCE_RECIPIENT_INVALID");
  }

  const approvedTemplateKeys = new Set<WhatsAppTemplateKey>(
    (environment.WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is WhatsAppTemplateKey =>
        value === "concierge_follow_up_en"
        || value === "concierge_follow_up_zh_hk"
      ),
  );
  if (!approvedTemplateKeys.has("concierge_follow_up_en")) {
    throw new Error("WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED");
  }

  const recordedRawWebhookBody = JSON.stringify({
    from: recipientId,
    type: "TEXT",
    messageId: "wamid.acceptance.recorded",
    timestamp: "2026-07-28T01:00:00.000Z",
    data: {text: "Acceptance fixture"},
  });
  const recordedWebhookSignature = createHmac("sha256", webhookSecret)
    .update(recordedRawWebhookBody)
    .digest("base64");

  return {
    apiToken,
    channelId,
    webhookSecret,
    recipientId,
    approvedTemplateKeys,
    recordedRawWebhookBody,
    recordedWebhookSignature,
  };
}
