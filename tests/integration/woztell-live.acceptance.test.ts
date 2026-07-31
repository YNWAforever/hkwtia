import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
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

    expect(credentials.approvedTemplateKeys.has("concierge_follow_up_en"))
      .toBe(true);
    expect(WHATSAPP_TEMPLATES.concierge_follow_up_en.variables)
      .toEqual(["memberName", "supportUrl"]);
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
      template: "concierge_follow_up_en",
      variables: {
        memberName: "Acceptance",
        supportUrl: "https://www.hkwtia.org/en/contact",
      },
      idempotencyKey: `acceptance:${Date.now()}`,
    })).resolves.toMatchObject({
      status: "sent",
      providerId: expect.any(String),
    });
  });
});
