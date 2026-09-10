import {describe, expect, it, vi} from "vitest";

import {
  createProductionWoztellProcessorDependencies,
} from "@/lib/ai/woztell-production";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {AiEnv, AppEnv} from "@/lib/config/env";

const env: AppEnv & AiEnv = {
  appUrl: "https://hkwtia.example",
  agentsEnabled: false,
  agentModelConcierge: "test-model",
};

function channel(): ChannelAdapter {
  return {
    sendSessionMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p"})),
    sendTemplateMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p"})),
    normalizeInbound: vi.fn(() => ({
      kind: "unsupported" as const,
      sender: null,
      text: null,
      intent: null,
    })),
    verifyWebhook: vi.fn(() => true),
  };
}

/**
 * Every dependency Task 4 added is OPTIONAL on
 * `WoztellWebhookProcessorDependencies`, so the existing fixtures stay green —
 * and that is exactly the trap `recordContact` set when it was added the same
 * way: a `?.()` call on a key production wiring forgot is a silent no-op that no
 * test notices and the provider reports as success. Nothing else in the suite
 * constructs the production bag, so this is the only thing standing between a
 * forgotten spread and a permanently dropped delivery tick.
 */
describe("production WOZTELL processor wiring (C-1 Task 4)", () => {
  const dependencies = createProductionWoztellProcessorDependencies(env, channel());

  it.each([
    "recordDeliveryStatus",
    "recordOutboundEcho",
    "notifyAssignee",
    "recordContact",
    "recordOptOut",
    "claimInbound",
    "resolveProfile",
    "markCompleted",
  ] as const)("wires %s", (key) => {
    expect(typeof dependencies[key]).toBe("function");
  });

  it("keeps the profile resolver's own resolveProfile last, so an opted-out member stays a member", () => {
    // `...store` then `...profileResolver` is load-bearing:
    // `store.resolveProfile` filters `WHERE profiles.whatsapp_opt_in = true` and
    // the resolver's does not, the later spread wins, and reversing them turns
    // an opted-out member into a stranger for whom a contact row is created and
    // the concierge answers. The new event-writer spread must therefore stay
    // after both, and must not shadow either.
    const source = dependencies.resolveProfile.toString();
    expect(source).not.toContain("whatsapp_opt_in = true");
  });
});
