import {describe, expect, it, vi} from "vitest";

import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

describe("WOZTELL ambiguous HTTP failure", () => {
  it("does not POST again after the provider accepts then returns 5xx", async () => {
    let providerSideEffects = 0;
    const fetchImpl = vi.fn(async () => {
      providerSideEffects += 1;
      return new Response("accepted before internal provider failure", {
        status: 503,
      });
    });
    const channel = createWoztellAdapter({
      RUN_LIVE_WOZTELL: "1",
      WOZTELL_API_TOKEN: "credential-free-fixture-token",
      WOZTELL_CHANNEL_ID: "fixture-channel",
    }, fetchImpl, () => NOW);
    let deliveryState:
      | "new"
      | "reserved"
      | "retryable"
      | "uncertain" = "new";
    const reserveDelivery = vi.fn(async () => {
      if (deliveryState === "new" || deliveryState === "retryable") {
        deliveryState = "reserved";
        return {status: "send" as const, deliveryId: "delivery-server"};
      }
      return {
        status: "uncertain" as const,
        deliveryId: "delivery-server",
      };
    });
    const markDeliveryRetryable = vi.fn(async () => {
      deliveryState = "retryable";
    });
    const markDeliveryUncertain = vi.fn(async () => {
      deliveryState = "uncertain";
    });
    const escalate = vi.fn(async () => undefined);
    const markCompleted = vi.fn()
      .mockRejectedValueOnce(new Error("INBOUND_COMPLETION_FAILED"))
      .mockResolvedValueOnce(undefined);
    const dependencies = {
      channel,
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
        pendingReply: "Persisted reply",
      })),
      markCompleted,
      setWhatsappOptIn: vi.fn(async () => undefined),
      concierge: {startTurn: vi.fn()},
      escalate,
      anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
      approvedTemplateKeys: new Set(),
      supportUrl: "https://www.hkwtia.org/en/contact",
      now: () => NOW,
      reserveDelivery,
      markDeliveryRetryable,
      markDeliveryUncertain,
    } as unknown as WoztellWebhookProcessorDependencies;
    const processor = createWoztellWebhookProcessor(dependencies);
    const payload = {
      from: "+85290000000",
      type: "TEXT",
      messageId: "wamid.server.inbound",
      timestamp: RECEIVED_AT.toISOString(),
      data: {text: "Hello"},
    };

    let firstError: unknown;
    try {
      await processor.process(payload);
    } catch (error) {
      firstError = error;
    }
    let recoveryResult: Awaited<ReturnType<typeof processor.process>>
      | undefined;
    let recoveryError: unknown;
    try {
      recoveryResult = await processor.process(payload);
    } catch (error) {
      recoveryError = error;
    }

    expect(providerSideEffects).toBe(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(firstError).toMatchObject({
      message: "INBOUND_COMPLETION_FAILED",
    });
    expect(recoveryError).toBeUndefined();
    expect(recoveryResult).toEqual({status: "escalated"});
    expect(markDeliveryRetryable).not.toHaveBeenCalled();
    expect(markDeliveryUncertain).toHaveBeenCalledOnce();
    expect(escalate).toHaveBeenCalledTimes(2);
    expect(escalate.mock.invocationCallOrder[0])
      .toBeLessThan(markCompleted.mock.invocationCallOrder[0]);
  });
});
