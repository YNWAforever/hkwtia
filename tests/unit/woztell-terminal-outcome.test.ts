import {describe, expect, it, vi} from "vitest";

import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

function errorOnlyTurn() {
  return {
    conversationId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    events: {
      async *[Symbol.asyncIterator]() {
        yield {
          event: "error",
          data: {code: "AI_TEMPORARILY_UNAVAILABLE"},
        };
      },
    },
    cancel: vi.fn(async () => undefined),
  };
}

function dependencies(
  overrides: Partial<WoztellWebhookProcessorDependencies> = {},
): WoztellWebhookProcessorDependencies {
  return {
    channel: {
      normalizeInbound: () => ({
        kind: "message",
        sender: "+85290000000",
        text: "Hello",
        intent: null,
        providerMessageId: "wamid.error-only",
        receivedAt: RECEIVED_AT,
      }),
      verifyWebhook: () => true,
      sendSessionMessage: vi.fn(),
      sendTemplateMessage: vi.fn(),
    },
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => ({
      status: "accepted" as const,
      conversationId: "11111111-1111-4111-8111-111111111111",
      owner: {
        kind: "anonymous" as const,
        anonymousOwnerHash: "a".repeat(64),
      },
      profileId: null,
      locale: "en" as const,
      memberName: "Member",
      whatsappOptIn: true,
    })),
    markRunOwned: vi.fn(async () => undefined),
    markReplyReady: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => errorOnlyTurn())},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
    approvedTemplateKeys: new Set(),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
    ...overrides,
  };
}

describe("WOZTELL terminal Concierge outcomes", () => {
  it("durably escalates an error-only turn before marking it completed", async () => {
    const escalation = vi.fn(async () => undefined);
    const markCompleted = vi.fn(async () => undefined);
    const processor = createWoztellWebhookProcessor(dependencies({
      escalate: escalation,
      markCompleted,
    }));

    await expect(processor.process({})).resolves.toEqual({status: "escalated"});
    expect(escalation).toHaveBeenCalledOnce();
    expect(markCompleted).toHaveBeenCalledOnce();
    expect(escalation.mock.invocationCallOrder[0])
      .toBeLessThan(markCompleted.mock.invocationCallOrder[0]);
  });

  it("leaves an error-only turn retryable when durable escalation fails", async () => {
    const markCompleted = vi.fn(async () => undefined);
    const processor = createWoztellWebhookProcessor(dependencies({
      escalate: vi.fn(async () => {
        throw new Error("ESCALATION_PERSISTENCE_FAILED");
      }),
      markCompleted,
    }));

    await expect(processor.process({}))
      .rejects.toThrow("ESCALATION_PERSISTENCE_FAILED");
    expect(markCompleted).not.toHaveBeenCalled();
  });
});
