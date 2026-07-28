import {describe, expect, it, vi} from "vitest";

import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");
const NOW = new Date("2026-07-28T02:00:00.000Z");

function acceptedProviderResponse(): Response {
  return new Response(JSON.stringify({
    ok: 1,
    sendResult: {
      ok: 1,
      result: [{messageEvent: {messageId: "wamid.outbound.accepted"}}],
    },
  }), {status: 200});
}

describe("WOZTELL delivery outbox", () => {
  it("does not POST again after provider acceptance when local completion failed", async () => {
    const fetchImpl = vi.fn(async () => acceptedProviderResponse());
    const channel = createWoztellAdapter({
      RUN_LIVE_WOZTELL: "1",
      WOZTELL_API_TOKEN: "credential-free-fixture-token",
      WOZTELL_CHANNEL_ID: "fixture-channel",
    }, fetchImpl, () => NOW);
    const reserveDelivery = vi.fn()
      .mockResolvedValueOnce({status: "send", deliveryId: "delivery-1"})
      .mockResolvedValueOnce({status: "uncertain", deliveryId: "delivery-1"});
    const markDeliverySent = vi.fn(async () => {
      throw new Error("LOCAL_DELIVERY_COMPLETION_FAILED");
    });
    const escalate = vi.fn(async () => undefined);
    const markCompleted = vi.fn(async () => undefined);
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
      markDeliverySent,
    } as unknown as WoztellWebhookProcessorDependencies;
    const processor = createWoztellWebhookProcessor(dependencies);
    const payload = {
      from: "+85290000000",
      type: "TEXT",
      messageId: "wamid.outbox.inbound",
      timestamp: RECEIVED_AT.toISOString(),
      data: {text: "Hello"},
    };

    await expect(processor.process(payload))
      .rejects.toThrow("LOCAL_DELIVERY_COMPLETION_FAILED");
    await expect(processor.process(payload))
      .resolves.toEqual({status: "escalated"});

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(escalate).toHaveBeenCalledOnce();
    expect(markCompleted).toHaveBeenCalledOnce();
  });
});
