import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
  acceptanceTemplateVariables,
  isWoztellAcceptanceEnabled,
  requireWoztellAcceptanceAuthorization,
} from "@/tests/fixtures/woztell-live-acceptance";

const authorized = isWoztellAcceptanceEnabled(process.env);

describe.runIf(authorized)("WOZTELL separately authorized live acceptance", () => {
  it("covers signature, payload normalization, template approval, and delivery response shape", async () => {
    const credentials = requireWoztellAcceptanceAuthorization(process.env);
    const adapter = createWoztellAdapter({
      RUN_LIVE_WOZTELL: "1",
      WOZTELL_API_TOKEN: credentials.apiToken,
      WOZTELL_CHANNEL_ID: credentials.channelId,
      WOZTELL_WEBHOOK_SECRET: credentials.webhookSecret,
    });

    // C-9 (C2 Task 13 Step 2). The template is whichever one the operator
    // approved, not a hard-coded concierge follow-up: the harness's ceiling was
    // lifted so this run can exercise a MARKETING template — the blast half of
    // the §6 gate — and hard-coding here would have gone red for exactly the
    // approval set that widening exists to allow.
    const [templateKey] = [...credentials.approvedTemplateKeys];
    if (!templateKey) throw new Error("WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED");
    const variables = acceptanceTemplateVariables(templateKey);
    // Meta rejects a template send whose BODY parameters are empty, and the
    // adapter builds the body as `variables[key] ?? ""`.
    expect(Object.keys(variables))
      .toEqual([...WHATSAPP_TEMPLATES[templateKey].variables]);
    for (const value of Object.values(variables)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    expect(adapter.verifyWebhook(
      credentials.recordedRawWebhookBody,
      credentials.recordedWebhookSignature,
    )).toBe(true);
    expect(adapter.normalizeInbound(
      JSON.parse(credentials.recordedRawWebhookBody),
    )).toMatchObject({
      kind: "message",
      sender: credentials.recipientId,
      providerMessageId: "wamid.acceptance.recorded",
    });
    await expect(adapter.sendTemplateMessage({
      whatsappOptIn: true,
      whatsappNumber: credentials.recipientId,
      template: templateKey,
      variables,
      idempotencyKey: `acceptance:${Date.now()}`,
    })).resolves.toMatchObject({
      status: "sent",
      providerId: expect.any(String),
    });
  });
});
