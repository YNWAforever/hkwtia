import {describe, expect, it, vi} from "vitest";

import {
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplateKey,
} from "@/config/whatsapp-templates";
import {
  createWoztellWebhookProcessor,
  type WoztellInboundClaim,
} from "@/lib/ai/woztell-webhook";
import {
  createWoztellAdapter,
  normalizeWhatsAppNumber,
} from "@/lib/channels/woztell";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    from: "+852 9000-0000",
    type: "TEXT",
    messageId: "wamid.inbound.1",
    timestamp: RECEIVED_AT.toISOString(),
    data: {text: "Hello"},
    ...overrides,
  };
}

function acceptedClaim(
  overrides: Partial<Extract<WoztellInboundClaim, {status: "accepted"}>> = {},
): Extract<WoztellInboundClaim, {status: "accepted"}> {
  return {
    status: "accepted",
    conversationId: "11111111-1111-4111-8111-111111111111",
    owner: {kind: "anonymous", anonymousOwnerHash: "a".repeat(64)},
    profileId: null,
    locale: "en",
    memberName: "Member",
    whatsappOptIn: true,
    ...overrides,
  };
}

function conciergeTurn(text = "Welcome") {
  return {
    conversationId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    events: {
      async *[Symbol.asyncIterator]() {
        yield {event: "delta", data: {text}} as const;
        yield {event: "done", data: {citations: [], escalationId: null}} as const;
      },
    },
    cancel: vi.fn(async () => undefined),
  };
}

function processorDependencies(overrides: Record<string, unknown> = {}) {
  const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
  return {
    channel: {
      ...adapter,
      sendSessionMessage: vi.fn(adapter.sendSessionMessage),
      sendTemplateMessage: vi.fn(adapter.sendTemplateMessage),
    },
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => acceptedClaim()),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => conciergeTurn())},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>([
      "concierge_follow_up_en",
      "concierge_follow_up_zh_hk",
    ]),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
    ...overrides,
  };
}

describe("WOZTELL Concierge adapter", () => {
  it("extracts a provider message ID and valid received time", () => {
    expect(createWoztellAdapter({}, vi.fn()).normalizeInbound(inbound()))
      .toEqual({
        kind: "message",
        sender: "+852 9000-0000",
        text: "Hello",
        intent: null,
        providerMessageId: "wamid.inbound.1",
        receivedAt: RECEIVED_AT,
      });
  });

  it.each([
    {messageId: "", timestamp: RECEIVED_AT.toISOString()},
    {messageId: "wamid.inbound.1", timestamp: "not-a-date"},
  ])("rejects inbound text without a usable provider ID and timestamp", (fields) => {
    expect(createWoztellAdapter({}, vi.fn()).normalizeInbound(inbound(fields)).kind)
      .toBe("unsupported");
  });

  it("normalizes senders to E.164 before profile matching", async () => {
    expect(normalizeWhatsAppNumber("+852 9000-0000")).toBe("+85290000000");
    expect(normalizeWhatsAppNumber("85290000000")).toBe("+85290000000");
    const dependencies = processorDependencies();
    await createWoztellWebhookProcessor(dependencies).process(inbound());
    expect(dependencies.resolveProfile).toHaveBeenCalledWith("+85290000000");
  });

  it("persists accepted text as WhatsApp and invokes the shared Concierge with a WhatsApp trigger", async () => {
    const dependencies = processorDependencies();
    await expect(createWoztellWebhookProcessor(dependencies).process(inbound()))
      .resolves.toMatchObject({status: "accepted"});
    expect(dependencies.claimInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: "wamid.inbound.1",
        receivedAt: RECEIVED_AT,
        content: "Hello",
        channel: "whatsapp",
      }),
    );
    expect(dependencies.concierge.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Hello",
        trigger: "whatsapp",
        inboundMessagePersisted: true,
      }),
    );
  });

  it("does not invoke the Concierge for unsupported inbound message types", async () => {
    const dependencies = processorDependencies();
    await expect(createWoztellWebhookProcessor(dependencies).process(
      inbound({type: "IMAGE"}),
    )).resolves.toEqual({status: "ignored"});
    expect(dependencies.claimInbound).not.toHaveBeenCalled();
    expect(dependencies.concierge.startTurn).not.toHaveBeenCalled();
  });

  it("treats duplicate provider message IDs idempotently", async () => {
    const dependencies = processorDependencies({
      claimInbound: vi.fn(async () => ({status: "duplicate"})),
    });
    await expect(createWoztellWebhookProcessor(dependencies).process(inbound()))
      .resolves.toEqual({status: "duplicate"});
    expect(dependencies.concierge.startTurn).not.toHaveBeenCalled();
    expect(dependencies.channel.sendSessionMessage).not.toHaveBeenCalled();
  });

  it.each(["STOP", "\u53d6\u6d88"])(
    "records %s and opts a matched member out without invoking the Concierge",
    async (text) => {
      const dependencies = processorDependencies({
        resolveProfile: vi.fn(async () => ({
          id: "profile-1",
          displayName: "Ada",
          locale: "zh-HK",
          whatsappOptIn: true,
        })),
        claimInbound: vi.fn(async () => acceptedClaim({
          owner: {kind: "profile", profileId: "profile-1"},
          profileId: "profile-1",
          locale: "zh-HK",
          memberName: "Ada",
        })),
      });
      await expect(createWoztellWebhookProcessor(dependencies).process(
        inbound({data: {text}}),
      )).resolves.toEqual({status: "opted_out"});
      expect(dependencies.setWhatsappOptIn)
        .toHaveBeenCalledWith("profile-1", false);
      expect(dependencies.concierge.startTurn).not.toHaveBeenCalled();
    },
  );

  it("keeps an unmatched normalized sender anonymous", async () => {
    const dependencies = processorDependencies();
    await createWoztellWebhookProcessor(dependencies).process(inbound());
    expect(dependencies.claimInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: {kind: "anonymous", anonymousOwnerHash: "a".repeat(64)},
        profileId: null,
      }),
    );
  });

  it("sends free-form output only inside the 24-hour window", async () => {
    const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
    await expect(adapter.sendSessionMessage({
      whatsappOptIn: true,
      whatsappNumber: "+85290000000",
      text: "Welcome",
      idempotencyKey: "reply:1",
      lastCustomerMessageAt: RECEIVED_AT,
    })).resolves.toEqual({status: "sent", providerId: "mock:reply:1"});
  });

  it("blocks free-form output outside the 24-hour window", async () => {
    const adapter = createWoztellAdapter(
      {},
      vi.fn(),
      () => new Date("2026-07-29T01:00:00.001Z"),
    );
    await expect(adapter.sendSessionMessage({
      whatsappOptIn: true,
      whatsappNumber: "+85290000000",
      text: "Welcome",
      idempotencyKey: "reply:late",
      lastCustomerMessageAt: RECEIVED_AT,
    })).resolves.toEqual({
      status: "blocked",
      reason: "outside_customer_service_window",
    });
  });

  it("uses only approved locale follow-up templates with ordered variables", async () => {
    expect(WHATSAPP_TEMPLATES.concierge_follow_up_en.variables)
      .toEqual(["memberName", "supportUrl"]);
    expect(WHATSAPP_TEMPLATES.concierge_follow_up_zh_hk.variables)
      .toEqual(["memberName", "supportUrl"]);
    const sendTemplateMessage = vi.fn(async () => ({
      status: "sent" as const,
      providerId: "mock:template",
    }));
    const dependencies = processorDependencies({
      channel: {
        ...createWoztellAdapter(
          {},
          vi.fn(),
          () => new Date("2026-07-29T01:00:00.001Z"),
        ),
        sendTemplateMessage,
      },
      claimInbound: vi.fn(async () => acceptedClaim({
        locale: "zh-HK",
        memberName: "Ada",
      })),
    });
    await createWoztellWebhookProcessor(dependencies).process(inbound());
    expect(sendTemplateMessage).toHaveBeenCalledWith(expect.objectContaining({
      template: "concierge_follow_up_zh_hk",
      variables: {
        memberName: "Ada",
        supportUrl: "https://www.hkwtia.org/en/contact",
      },
    }));
  });

  it("escalates instead of sending when the locale template is not approved", async () => {
    const dependencies = processorDependencies({
      approvedTemplateKeys: new Set<WhatsAppTemplateKey>(),
      channel: {
        ...createWoztellAdapter(
          {},
          vi.fn(),
          () => new Date("2026-07-29T01:00:00.001Z"),
        ),
        sendTemplateMessage: vi.fn(),
      },
    });
    await expect(createWoztellWebhookProcessor(dependencies).process(inbound()))
      .resolves.toEqual({status: "escalated"});
    expect(dependencies.escalate).toHaveBeenCalledWith(
      expect.objectContaining({reason: "approved_template_unavailable"}),
    );
  });
});
