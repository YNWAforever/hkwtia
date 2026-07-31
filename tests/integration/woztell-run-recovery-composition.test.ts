import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
  type WoztellRunRecovery,
} from "@/lib/ai/woztell-webhook";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

function dependencies(
  recovery: WoztellRunRecovery,
  overrides: Partial<WoztellWebhookProcessorDependencies> = {},
) {
  const startTurn = vi.fn(async () => ({
    conversationId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    events: {
      async *[Symbol.asyncIterator]() {
        yield {event: "delta", data: {text: "Fresh answer"}};
        yield {event: "done", data: {}};
      },
    },
    cancel: vi.fn(async () => undefined),
  }));
  const sendSessionMessage = vi.fn(async () => ({
    status: "sent" as const,
    providerId: "wamid.outbound",
  }));
  return {
    channel: {
      normalizeInbound: () => ({
        kind: "message" as const,
        sender: "+85290000000",
        text: "Hello",
        intent: null,
        providerMessageId: "wamid.recovery",
        receivedAt: RECEIVED_AT,
      }),
      verifyWebhook: () => true,
      sendSessionMessage,
      sendTemplateMessage: vi.fn(),
    },
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => ({
      status: "accepted" as const,
      conversationId: "11111111-1111-4111-8111-111111111111",
      owner: {kind: "anonymous" as const, anonymousOwnerHash: "a".repeat(64)},
      profileId: null,
      locale: "en" as const,
      memberName: "Member",
      whatsappOptIn: true,
    })),
    recoverRun: vi.fn(async () => recovery),
    markRunOwned: vi.fn(async () => undefined),
    markReplyReady: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>(),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
    ...overrides,
  };
}

describe("WOZTELL production recovery composition", () => {
  it("reconstructs a persisted successful reply without a second Concierge turn", async () => {
    const deps = dependencies({
      status: "reply_ready",
      reply: "Persisted answer",
    });

    await expect(createWoztellWebhookProcessor(deps).process({}))
      .resolves.toEqual({status: "accepted"});

    expect(deps.concierge.startTurn).not.toHaveBeenCalled();
    expect(deps.markReplyReady).toHaveBeenCalledWith(
      "wamid.recovery",
      "Persisted answer",
      expect.any(Date),
    );
    expect(deps.channel.sendSessionMessage).toHaveBeenCalledWith(
      expect.objectContaining({text: "Persisted answer"}),
    );
  });

  it("durably escalates an ambiguous configured run without replaying tools", async () => {
    const deps = dependencies({status: "escalate_ambiguous"});

    await expect(createWoztellWebhookProcessor(deps).process({}))
      .resolves.toEqual({status: "escalated"});

    expect(deps.concierge.startTurn).not.toHaveBeenCalled();
    expect(deps.escalate).toHaveBeenCalledWith(expect.objectContaining({
      reason: "concierge_run_ambiguous",
    }));
    expect(deps.markCompleted).toHaveBeenCalledOnce();
  });

  it("leaves an ambiguous run retryable if durable escalation fails", async () => {
    const markCompleted = vi.fn(async () => undefined);
    const deps = dependencies({status: "escalate_ambiguous"}, {
      escalate: vi.fn(async () => {
        throw new Error("RECOVERY_ESCALATION_FAILED");
      }),
      markCompleted,
    });

    await expect(createWoztellWebhookProcessor(deps).process({}))
      .rejects.toThrow("RECOVERY_ESCALATION_FAILED");
    expect(deps.concierge.startTurn).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("allows a pre-provider run to resume exactly one Concierge turn", async () => {
    const deps = dependencies({status: "resume_pre_provider"});

    await expect(createWoztellWebhookProcessor(deps).process({}))
      .resolves.toEqual({status: "accepted"});
    expect(deps.concierge.startTurn).toHaveBeenCalledOnce();
  });
});
