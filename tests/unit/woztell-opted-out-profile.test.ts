import {describe, expect, it, vi} from "vitest";

import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";

const RECEIVED_AT = new Date("2026-07-28T01:00:00.000Z");

describe("WOZTELL opted-out profile identity", () => {
  it("persists inbound under the matched profile and performs no Concierge or outbound work", async () => {
    const startTurn = vi.fn();
    const sendSessionMessage = vi.fn();
    const sendTemplateMessage = vi.fn();
    const claimInbound = vi.fn(async (
      input: Parameters<WoztellWebhookProcessorDependencies["claimInbound"]>[0],
    ) => ({
      status: "accepted" as const,
      conversationId: "11111111-1111-4111-8111-111111111111",
      owner: input.owner,
      profileId: input.profileId,
      locale: input.locale,
      memberName: input.memberName,
      whatsappOptIn: input.whatsappOptIn,
    }));
    const dependencies: WoztellWebhookProcessorDependencies = {
      channel: {
        normalizeInbound: () => ({
          kind: "message",
          sender: "+85290000000",
          text: "Hello",
          intent: null,
          providerMessageId: "wamid.opted-out",
          receivedAt: RECEIVED_AT,
        }),
        verifyWebhook: () => true,
        sendSessionMessage,
        sendTemplateMessage,
      },
      resolveProfile: vi.fn(async () => ({
        id: "profile-opted-out",
        displayName: "Ada",
        locale: "en" as const,
        whatsappOptIn: false,
      })),
      claimInbound,
      markCompleted: vi.fn(async () => undefined),
      setWhatsappOptIn: vi.fn(async () => undefined),
      concierge: {startTurn},
      escalate: vi.fn(async () => undefined),
      anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
      approvedTemplateKeys: new Set(),
      supportUrl: "https://www.hkwtia.org/en/contact",
    };

    await expect(createWoztellWebhookProcessor(dependencies).process({}))
      .resolves.toEqual({status: "opted_out"});
    expect(claimInbound).toHaveBeenCalledWith(expect.objectContaining({
      owner: {kind: "profile", profileId: "profile-opted-out"},
      profileId: "profile-opted-out",
      whatsappOptIn: false,
    }));
    expect(startTurn).not.toHaveBeenCalled();
    expect(sendSessionMessage).not.toHaveBeenCalled();
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });
});
