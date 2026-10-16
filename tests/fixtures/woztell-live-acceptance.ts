import {createHmac} from "node:crypto";

import {
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplateKey,
} from "@/config/whatsapp-templates";

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

/**
 * Every BODY parameter of one template, resolved to a non-empty value.
 *
 * C-9 (C2 Task 13 Step 2). Meta rejects a template send whose body parameters
 * are empty, and `lib/channels/woztell.ts` builds the body as
 * `variables[key] ?? ""` — so a blast leg that left one blank would fail at the
 * provider during the go-live walk and read exactly like a credential problem.
 * The harness now resolves whichever template the operator approved, rather
 * than carrying one hand-written pair for the two concierge keys.
 */
export function acceptanceTemplateVariables(
  key: WhatsAppTemplateKey,
): Record<string, string> {
  return Object.fromEntries(
    WHATSAPP_TEMPLATES[key].variables.map((name: string) => [
      name,
      name.toLowerCase().endsWith("url")
        ? "https://www.hkwtia.org/en/contact"
        : "Acceptance",
    ]),
  );
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

  // C-9 (C2 Task 13 Step 2). This filter used to accept the two concierge
  // follow-ups and nothing else, and then REQUIRED `concierge_follow_up_en` — so
  // the harness could exercise the human reply lane and could not exercise a
  // template blast at all, which is half of what §6 gates go-live on. The
  // ceiling is now the config: any key it declares may be named, and the only
  // requirement is that the operator named at least one.
  //
  // `Object.hasOwn`, not `in`: `"constructor" in WHATSAPP_TEMPLATES` is true
  // through the prototype chain, and this predicate is the type assertion that
  // decides which element name a live acceptance run may put on the wire.
  const approvedTemplateKeys = new Set<WhatsAppTemplateKey>(
    (environment.WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is WhatsAppTemplateKey =>
        Object.hasOwn(WHATSAPP_TEMPLATES, value)
      ),
  );
  // Still fail-closed, and deliberately still the same error string: an
  // acceptance run that names no approved template would send an element name
  // Meta has not approved, which is a provider 4xx, a permanent failure and a
  // staff task per recipient (S-14). "At least one" is the widening; "none is
  // an error" is not negotiable.
  if (approvedTemplateKeys.size === 0) {
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
