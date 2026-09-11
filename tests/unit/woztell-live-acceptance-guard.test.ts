import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
  WOZTELL_ACCEPTANCE_AUTHORIZATION,
  WOZTELL_ACCEPTANCE_TARGET_KIND,
  acceptanceTemplateVariables,
  isWoztellAcceptanceEnabled,
  requireWoztellAcceptanceAuthorization,
} from "@/tests/fixtures/woztell-live-acceptance";

const credentials = {
  WOZTELL_ACCEPTANCE_API_TOKEN: "credential-free-fixture-token",
  WOZTELL_ACCEPTANCE_CHANNEL_ID: "fixture-channel",
  WOZTELL_ACCEPTANCE_WEBHOOK_SECRET: "credential-free-fixture-secret",
  WOZTELL_ACCEPTANCE_RECIPIENT_ID: "85290000000",
};

function authorizedEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
) {
  return {
    ...credentials,
    RUN_LIVE_WOZTELL_ACCEPTANCE: "1",
    WOZTELL_ACCEPTANCE_AUTHORIZED: WOZTELL_ACCEPTANCE_AUTHORIZATION,
    WOZTELL_ACCEPTANCE_ALLOW_DELIVERY: "1",
    WOZTELL_ACCEPTANCE_TARGET_KIND,
    WOZTELL_ACCEPTANCE_EXPECTED_API_HOST: "bot.api.woztell.com",
    WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS: "concierge_follow_up_en",
    ...overrides,
  };
}

describe("WOZTELL live acceptance authorization guard", () => {
  it("requires an independent live flag", () => {
    expect(() => requireWoztellAcceptanceAuthorization({
      ...credentials,
      WOZTELL_ACCEPTANCE_AUTHORIZED: WOZTELL_ACCEPTANCE_AUTHORIZATION,
    })).toThrow("WOZTELL_ACCEPTANCE_LIVE_FLAG_REQUIRED");
  });

  it("requires an exact independent authorization sentinel", () => {
    expect(() => requireWoztellAcceptanceAuthorization({
      ...credentials,
      RUN_LIVE_WOZTELL_ACCEPTANCE: "1",
      WOZTELL_ACCEPTANCE_AUTHORIZED: "yes",
    })).toThrow("WOZTELL_ACCEPTANCE_AUTHORIZATION_REQUIRED");
  });

  it("requires separately named acceptance credentials", () => {
    expect(() => requireWoztellAcceptanceAuthorization({
      RUN_LIVE_WOZTELL_ACCEPTANCE: "1",
      WOZTELL_ACCEPTANCE_AUTHORIZED: WOZTELL_ACCEPTANCE_AUTHORIZATION,
    })).toThrow("WOZTELL_ACCEPTANCE_CREDENTIALS_REQUIRED");
  });

  it("requires explicit delivery, sandbox target, host, and template approval", () => {
    expect(() => requireWoztellAcceptanceAuthorization(
      authorizedEnvironment({WOZTELL_ACCEPTANCE_ALLOW_DELIVERY: undefined}),
    )).toThrow("WOZTELL_ACCEPTANCE_DELIVERY_FLAG_REQUIRED");
    expect(() => requireWoztellAcceptanceAuthorization(
      authorizedEnvironment({WOZTELL_ACCEPTANCE_TARGET_KIND: "production"}),
    )).toThrow("WOZTELL_ACCEPTANCE_SANDBOX_TARGET_REQUIRED");
    expect(() => requireWoztellAcceptanceAuthorization(
      authorizedEnvironment({
        WOZTELL_ACCEPTANCE_EXPECTED_API_HOST: "example.test",
      }),
    )).toThrow("WOZTELL_ACCEPTANCE_API_HOST_MISMATCH");
    expect(() => requireWoztellAcceptanceAuthorization(
      authorizedEnvironment({
        WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS: "",
      }),
    )).toThrow("WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED");
  });

  // C-9 (C2 Task 13 Step 2). The filter used to accept the two concierge
  // follow-ups and nothing else and then require `concierge_follow_up_en`, so
  // the harness could not exercise a template blast at all — half of what §6
  // gates go-live on. These three cases are the widening and its two edges.
  it("accepts an approval set naming only a marketing template", () => {
    const guarded = requireWoztellAcceptanceAuthorization(authorizedEnvironment({
      WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS: "wtia_announcement_en",
    }));
    expect([...guarded.approvedTemplateKeys]).toEqual(["wtia_announcement_en"]);
    expect(guarded.approvedTemplateKeys.has("concierge_follow_up_en")).toBe(false);
    expect(WHATSAPP_TEMPLATES.wtia_announcement_en.category).toBe("marketing");

    // The blast leg is only reachable if every BODY parameter resolves: Meta
    // rejects a template send with an empty parameter, and the adapter builds
    // the body as `variables[key] ?? ""`.
    const variables = acceptanceTemplateVariables("wtia_announcement_en");
    expect(Object.keys(variables))
      .toEqual([...WHATSAPP_TEMPLATES.wtia_announcement_en.variables]);
    for (const value of Object.values(variables)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("drops a key the config does not declare and refuses an all-unknown set", () => {
    const guarded = requireWoztellAcceptanceAuthorization(authorizedEnvironment({
      WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS:
        "wtia_lead_followup_zh_hk, not_a_template",
    }));
    expect([...guarded.approvedTemplateKeys]).toEqual(["wtia_lead_followup_zh_hk"]);
    expect(() => requireWoztellAcceptanceAuthorization(authorizedEnvironment({
      WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS: "not_a_template",
    }))).toThrow("WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED");
  });

  // `"constructor" in WHATSAPP_TEMPLATES` is true through the prototype chain,
  // and this predicate is the type assertion deciding which element name a live
  // run may put on the wire. `Object.hasOwn` is what keeps it honest.
  it("does not accept an inherited property name as a template key", () => {
    expect(() => requireWoztellAcceptanceAuthorization(authorizedEnvironment({
      WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS: "constructor, toString",
    }))).toThrow("WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED");
  });

  it("is disabled by default before any credentials or network are used", () => {
    expect(isWoztellAcceptanceEnabled({})).toBe(false);
    expect(isWoztellAcceptanceEnabled({
      RUN_LIVE_WOZTELL_ACCEPTANCE: "1",
      WOZTELL_ACCEPTANCE_AUTHORIZED: WOZTELL_ACCEPTANCE_AUTHORIZATION,
    })).toBe(false);
  });

  it("covers recorded signature, payload, template order, and provider response without real network", async () => {
    const guarded = requireWoztellAcceptanceAuthorization(
      authorizedEnvironment(),
    );
    const fetchImpl = vi.fn(
      async (input: string, init: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify({
          ok: 1,
          sendResult: {
            ok: 1,
            result: [{
              messageEvent: {messageId: "wamid.recorded.delivery"},
            }],
          },
        }), {status: 200});
      },
    );
    const adapter = createWoztellAdapter({
      RUN_LIVE_WOZTELL: "1",
      WOZTELL_API_TOKEN: guarded.apiToken,
      WOZTELL_CHANNEL_ID: guarded.channelId,
      WOZTELL_WEBHOOK_SECRET: guarded.webhookSecret,
    }, fetchImpl);

    expect(guarded.recordedWebhookSignature)
      .toMatch(/^[A-Za-z0-9+/]{43}=$/u);
    expect(adapter.verifyWebhook(
      guarded.recordedRawWebhookBody,
      guarded.recordedWebhookSignature,
    )).toBe(true);
    expect(adapter.normalizeInbound(
      JSON.parse(guarded.recordedRawWebhookBody),
    )).toMatchObject({
      kind: "message",
      sender: guarded.recipientId,
      providerMessageId: "wamid.acceptance.recorded",
    });
    expect(WHATSAPP_TEMPLATES.concierge_follow_up_en.variables)
      .toEqual(["memberName", "supportUrl"]);

    await expect(adapter.sendTemplateMessage({
      whatsappOptIn: true,
      whatsappNumber: guarded.recipientId,
      template: "concierge_follow_up_en",
      variables: {
        memberName: "Acceptance",
        supportUrl: "https://www.hkwtia.org/en/contact",
      },
      idempotencyKey: "acceptance:recorded",
    })).resolves.toEqual({
      status: "sent",
      providerId: "wamid.recorded.delivery",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    if (!request) throw new Error("RECORDED_FETCH_CALL_MISSING");
    expect(request.headers).toEqual({
      authorization: "Bearer credential-free-fixture-token",
      "content-type": "application/json",
    });
    expect(String(request.body)).not.toContain("acceptance:recorded");
  });
});
