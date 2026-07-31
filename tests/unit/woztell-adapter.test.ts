import {createHmac} from "node:crypto";

import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {eligibleWhatsAppRecipient, woztellEnv} from "@/tests/fixtures/woztell";

describe("WOZTELL channel adapter", () => {
  it("returns a deterministic mock provider ID without calling fetch when credentials are absent", async () => {
    const fetchImpl = vi.fn();
    const adapter = createWoztellAdapter({}, fetchImpl);

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "renewal_14",
      variables: {memberName: "A", renewalDate: "2027-01-01", renewalUrl: "https://example.test/renew"},
      idempotencyKey: "delivery:renewal-14",
    })).resolves.toEqual({status: "sent", providerId: "mock:delivery:renewal-14"});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the approved renewal D-14 template with its exact mapped variables", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: 1,
      sendResult: {ok: 1, result: [{messageEvent: {messageId: "wamid-1"}}]},
    }), {status: 200}));
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);
    const template = WHATSAPP_TEMPLATES.renewal_14;

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "renewal_14",
      variables: {memberName: "A", renewalDate: "2027-01-01", renewalUrl: "https://example.test/renew"},
      idempotencyKey: "delivery:renewal-14",
    })).resolves.toEqual({status: "sent", providerId: "wamid-1"});

    expect(fetchImpl).toHaveBeenCalledWith("https://bot.api.woztell.com/sendResponses", {
      method: "POST",
      headers: {
        authorization: "Bearer woztell-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channelId: "channel-123",
        recipientId: "85290000000",
        response: [{
          type: "TEMPLATE",
          elementName: template.name,
          languageCode: template.languageCode,
          components: [{
            type: "body",
            parameters: template.variables.map((key) => ({type: "text", text: ({
              memberName: "A",
              renewalDate: "2027-01-01",
              renewalUrl: "https://example.test/renew",
            })[key]})),
          }],
        }],
      }),
    });
  });

  it("maps provider failures to a sanitized code without logging sensitive values", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createWoztellAdapter(woztellEnv, async () => new Response(
      "recipient 85290000000 token woztell-test-token private-template-variable",
      {status: 503},
    ));

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "private-template-variable",
      idempotencyKey: "delivery:session",
    })).rejects.toMatchObject({
      code: "provider_acceptance_uncertain",
      message: "WHATSAPP_DELIVERY_FAILED:provider_acceptance_uncertain",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("normalizes STOP and 取消 as opt-out intent without mutating state", () => {
    const adapter = createWoztellAdapter({}, vi.fn());
    const envelope = {
      from: "85290000000",
      type: "TEXT",
      messageId: "wamid.opt-out",
      timestamp: "2026-07-28T01:00:00.000Z",
    };

    expect(adapter.normalizeInbound({...envelope, data: {text: " STOP "}}))
      .toMatchObject({kind: "message", intent: "opt_out"});
    expect(adapter.normalizeInbound({...envelope, data: {text: "\u53d6\u6d88"}}))
      .toMatchObject({kind: "message", intent: "opt_out"});
  });

  it("verifies WOZTELL signatures and rejects wrong-length signatures through a fixed-length comparison", () => {
    const adapter = createWoztellAdapter(woztellEnv, vi.fn());
    const body = '{"type":"TEXT"}';
    const signature = createHmac("sha256", woztellEnv.WOZTELL_WEBHOOK_SECRET).update(body).digest("base64");

    expect(adapter.verifyWebhook(body, signature)).toBe(true);
    expect(adapter.verifyWebhook(body, "wrong")).toBe(false);
    expect(adapter.verifyWebhook(body, null)).toBe(false);
  });
});
