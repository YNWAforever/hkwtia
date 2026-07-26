import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {eligibleWhatsAppRecipient, woztellEnv} from "@/tests/fixtures/woztell";

function successfulResponse(messageId: string): Response {
  return new Response(JSON.stringify({
    ok: 1,
    sendResult: {ok: 1, result: [{messageEvent: {messageId}}]},
  }), {status: 200});
}

describe("WOZTELL review coverage", () => {
  it("sends dunning D3 with the configured approved template and exact variable order", async () => {
    const fetchImpl = vi.fn(async () => successfulResponse("wamid-d3"));
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);
    const template = WHATSAPP_TEMPLATES.dunning_3;
    const variables = {memberName: "A", amountDue: "HK$100", paymentUrl: "https://example.test/pay"};

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "dunning_3",
      variables,
      idempotencyKey: "delivery:dunning-3",
    })).resolves.toEqual({status: "sent", providerId: "wamid-d3"});

    expect(fetchImpl).toHaveBeenCalledWith("https://bot.api.woztell.com/sendResponses", {
      method: "POST",
      headers: {authorization: "Bearer woztell-test-token", "content-type": "application/json"},
      body: JSON.stringify({
        channelId: "channel-123",
        recipientId: "85290000000",
        response: [{
          type: "TEMPLATE",
          elementName: template.name,
          languageCode: template.languageCode,
          components: [{
            type: "body",
            parameters: template.variables.map((key) => ({type: "text", text: variables[key]})),
          }],
        }],
      }),
    });
  });

  it("serializes a successful live session message through the documented boundary", async () => {
    const fetchImpl = vi.fn(async () => successfulResponse("wamid-session"));
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "Private session message",
      idempotencyKey: "delivery:session",
    })).resolves.toEqual({status: "sent", providerId: "wamid-session"});

    expect(fetchImpl).toHaveBeenCalledWith("https://bot.api.woztell.com/sendResponses", {
      method: "POST",
      headers: {authorization: "Bearer woztell-test-token", "content-type": "application/json"},
      body: JSON.stringify({
        channelId: "channel-123",
        recipientId: "85290000000",
        response: [{type: "TEXT", text: "Private session message"}],
      }),
    });
  });

  it.each([
    {env: {WOZTELL_API_TOKEN: "token-only", WOZTELL_CHANNEL_ID: "   "}, suffix: "blank-channel"},
    {env: {WOZTELL_API_TOKEN: "   ", WOZTELL_CHANNEL_ID: "channel-only"}, suffix: "blank-token"},
    {env: {WOZTELL_API_TOKEN: "token-only"}, suffix: "missing-channel"},
    {env: {WOZTELL_CHANNEL_ID: "channel-only"}, suffix: "missing-token"},
  ])("uses deterministic mock mode with partial credentials ($suffix)", async ({env, suffix}) => {
    const fetchImpl = vi.fn();
    const adapter = createWoztellAdapter(env, fetchImpl);

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "renewal_14",
      variables: {memberName: "A", renewalDate: "2027-01-01", renewalUrl: "https://example.test/renew"},
      idempotencyKey: `delivery:${suffix}`,
    })).resolves.toEqual({status: "sent", providerId: `mock:delivery:${suffix}`});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes malformed and unsupported inbound payloads without state mutation", () => {
    const adapter = createWoztellAdapter({}, vi.fn());

    expect(adapter.normalizeInbound(null)).toEqual({kind: "unsupported", sender: null, text: null, intent: null});
    expect(adapter.normalizeInbound({from: "85290000000", type: "IMAGE", data: {text: "STOP"}}))
      .toEqual({kind: "unsupported", sender: "85290000000", text: null, intent: null});
  });

  it("maps a malformed 2xx provider body to a sanitized failure without body leakage", async () => {
    const adapter = createWoztellAdapter(woztellEnv, async () => new Response(
      "private provider response 85290000000 woztell-test-token",
      {status: 200},
    ));

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "Private session message",
      idempotencyKey: "delivery:malformed-response",
    })).rejects.toMatchObject({
      code: "provider_unclassified_failure",
      message: "WHATSAPP_DELIVERY_FAILED:provider_unclassified_failure",
    });
  });
});
