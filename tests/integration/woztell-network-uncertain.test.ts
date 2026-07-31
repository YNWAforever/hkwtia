import {describe, expect, it, vi} from "vitest";

import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

describe("WOZTELL ambiguous network dispatch", () => {
  it("does not fetch again after a generic fetch rejection may have dispatched", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connection_reset_after_dispatch");
    });
    const channel = createWoztellAdapter({
      RUN_LIVE_WOZTELL: "1",
      WOZTELL_API_TOKEN: "credential-free-fixture-token",
      WOZTELL_CHANNEL_ID: "fixture-channel",
    }, fetchImpl, () => NOW);
    let deliveryState: "new" | "reserved" | "uncertain" = "new";
    const reserveDelivery = vi.fn(async () => {
      if (deliveryState === "new") {
        deliveryState = "reserved";
        return {status: "send" as const, deliveryId: "delivery-network"};
      }
      return {status: "uncertain" as const, deliveryId: "delivery-network"};
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
        owner: {kind: "anonymous" as const, anonymousOwnerHash: "a".repeat(64)},
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
      markDeliveryUncertain,
    } as unknown as WoztellWebhookProcessorDependencies;
    const processor = createWoztellWebhookProcessor(dependencies);
    const payload = {
      from: "+85290000000",
      type: "TEXT",
      messageId: "wamid.network.inbound",
      timestamp: RECEIVED_AT.toISOString(),
      data: {text: "Hello"},
    };

    await expect(processor.process(payload))
      .rejects.toThrow("INBOUND_COMPLETION_FAILED");
    await expect(processor.process(payload))
      .resolves.toEqual({status: "escalated"});

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(markDeliveryUncertain).toHaveBeenCalledOnce();
    expect(escalate).toHaveBeenCalledTimes(2);
    expect(escalate.mock.invocationCallOrder[0])
      .toBeLessThan(markCompleted.mock.invocationCallOrder[0]);
  });
});
