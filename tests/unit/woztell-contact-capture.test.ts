import {describe, expect, it, vi} from "vitest";

import {createWoztellWebhookProcessor, type WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";

const RECEIVED_AT = new Date("2026-09-08T01:00:00.000Z");

function dependencies(text: string, profile: null | {id: string; displayName: string; locale: "en"; whatsappOptIn: boolean}) {
  const recordContact = vi.fn(async () => undefined);
  const recordOptOut = vi.fn(async () => undefined);
  const setWhatsappOptIn = vi.fn(async () => undefined);
  const deps: WoztellWebhookProcessorDependencies = {
    channel: {
      normalizeInbound: () => ({kind: "message", sender: "+852 9123 4567", text, intent: text === "STOP" ? "opt_out" : null, providerMessageId: `wamid.${text}`, receivedAt: RECEIVED_AT, whatsappMemberId: null}),
      verifyWebhook: () => true,
      sendSessionMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p1"})),
      sendTemplateMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p2"})),
    },
    resolveProfile: vi.fn(async () => profile),
    claimInbound: vi.fn(async (input) => ({status: "accepted" as const, conversationId: "11111111-1111-4111-8111-111111111111", owner: input.owner, profileId: input.profileId, locale: input.locale, memberName: input.memberName, whatsappOptIn: input.whatsappOptIn, handling: "bot" as const, lastInboundAt: null})),
    recordContact,
    recordOptOut,
    setWhatsappOptIn,
    markCompleted: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => ({conversationId: "c", runId: "r", events: (async function* () { yield {event: "done", data: {}}; })(), cancel: async () => undefined}))},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: () => "hash",
    approvedTemplateKeys: new Set(),
    supportUrl: "https://hkwtia.example/en/contact",
  };
  return {deps, recordContact, recordOptOut, setWhatsappOptIn};
}

describe("WOZTELL contact capture (programme D-6)", () => {
  it("records an unknown sender as a contact before the concierge runs", async () => {
    const {deps, recordContact} = dependencies("Hello", null);
    await createWoztellWebhookProcessor(deps).process({});
    expect(recordContact).toHaveBeenCalledWith({phoneE164: "+85291234567", locale: "en", receivedAt: RECEIVED_AT});
  });

  it("does not create a contact for a recognised member", async () => {
    const {deps, recordContact} = dependencies("Hello", {id: "p1", displayName: "Ada", locale: "en", whatsappOptIn: true});
    await createWoztellWebhookProcessor(deps).process({});
    expect(recordContact).not.toHaveBeenCalled();
  });

  it("writes a suppression for STOP from a member and from a prospect", async () => {
    const member = dependencies("STOP", {id: "p1", displayName: "Ada", locale: "en", whatsappOptIn: true});
    await createWoztellWebhookProcessor(member.deps).process({});
    expect(member.setWhatsappOptIn).toHaveBeenCalledWith("p1", false);
    expect(member.recordOptOut).toHaveBeenCalledWith({profileId: "p1", phoneE164: "+85291234567"});

    const prospect = dependencies("STOP", null);
    await createWoztellWebhookProcessor(prospect.deps).process({});
    expect(prospect.recordOptOut).toHaveBeenCalledWith({profileId: null, phoneE164: "+85291234567"});
  });
});
