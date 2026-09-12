import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  createWoztellWebhookProcessor,
  type WoztellInboundClaim,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
  woztellDeliveryStatusPayload,
  woztellInboundTextPayload,
  woztellInboundWithMemberIdPayload,
  woztellOutboundEchoPayload,
} from "@/tests/fixtures/woztell";

const NOW = new Date("2026-09-10T02:00:00.000Z");
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Every assertion here is on the PROCESSOR RESULT, never on an HTTP status, and
 * that is the whole point of Task 4. `lib/api/woztell-webhook-route.ts` answers
 * 202 to all of these, so an event kind we get subtly wrong is indistinguishable
 * from success at the provider — there is no counter, no log line and no
 * dead-letter table anywhere in this subsystem. Because the route returns the
 * processor result AS the response body, the `reason` / `matched` / `disposition`
 * discriminators below are readable in Woztell's own webhook delivery log, and
 * they carry no sender, no text and no provider body, so nothing here has to be
 * logged (`tests/unit/woztell-adapter.test.ts` forbids a console call).
 */
function acceptedClaim(
  overrides: Partial<Extract<WoztellInboundClaim, {status: "accepted"}>> = {},
): Extract<WoztellInboundClaim, {status: "accepted"}> {
  return {
    status: "accepted",
    conversationId: CONVERSATION_ID,
    owner: {kind: "anonymous", anonymousOwnerHash: "a".repeat(64)},
    profileId: null,
    locale: "en",
    memberName: "Member",
    whatsappOptIn: true,
    handling: "bot",
    assignedToProfileId: null,
    lastInboundAt: null,
    ...overrides,
  };
}

function conciergeTurn(text = "Welcome") {
  return {
    conversationId: CONVERSATION_ID,
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

function dependencies(overrides: Record<string, unknown> = {}) {
  const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
  return {
    channel: {
      ...adapter,
      sendSessionMessage: vi.fn(adapter.sendSessionMessage),
      sendTemplateMessage: vi.fn(adapter.sendTemplateMessage),
    },
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => acceptedClaim()),
    recordDeliveryStatus: vi.fn(async () => ({matched: true})),
    recordOutboundEcho: vi.fn(async () => ({disposition: "adopted" as const})),
    notifyAssignee: vi.fn(async () => undefined),
    recordContact: vi.fn(async () => ({id: "contact-1"})),
    recordOptOut: vi.fn(async () => undefined),
    recoverRun: vi.fn(async () => ({status: "start_new" as const})),
    markRunOwned: vi.fn(async () => undefined),
    markReplyReady: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
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

describe("WOZTELL webhook v2 — three event kinds (C-1 Task 4)", () => {
  describe("delivery statuses", () => {
    it("records a tick without touching the inbound lane", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process(woztellDeliveryStatusPayload))
        .resolves.toEqual({status: "delivery_recorded", matched: true});

      // A status event carries no sender text at all, so the inbound lane has
      // nothing to work with: reaching normalizeWhatsAppNumber, resolveProfile or
      // the concierge with one is the failure this asserts against.
      expect(deps.resolveProfile).not.toHaveBeenCalled();
      expect(deps.claimInbound).not.toHaveBeenCalled();
      expect(deps.concierge.startTurn).not.toHaveBeenCalled();
      // The repository parses `.strict()`, so the `kind` discriminator must be
      // stripped rather than spread through — a spread would be a ZodError, i.e.
      // a 500 and a Woztell retry loop for every tick.
      expect(deps.recordDeliveryStatus).toHaveBeenCalledWith({
        providerMessageId: "wamid.outbound.1",
        status: "delivered",
        errorCode: null,
        occurredAt: new Date(woztellDeliveryStatusPayload.timestamp),
      });
    });

    it("reports a miss rather than claiming success, because every message sent before this release is one", async () => {
      const deps = dependencies({
        recordDeliveryStatus: vi.fn(async () => ({matched: false})),
      });

      await expect(createWoztellWebhookProcessor(deps).process(woztellDeliveryStatusPayload))
        .resolves.toEqual({status: "delivery_recorded", matched: false});
    });

    it("stays a no-op when the writer is not wired, instead of pretending it matched", async () => {
      const deps = dependencies({recordDeliveryStatus: undefined});

      await expect(createWoztellWebhookProcessor(deps).process(woztellDeliveryStatusPayload))
        .resolves.toEqual({status: "delivery_recorded", matched: false});
    });
  });

  describe("outbound echoes", () => {
    it("records the echo against the normalised recipient and never starts a bot turn", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process(woztellOutboundEchoPayload))
        .resolves.toEqual({status: "echo_recorded", disposition: "adopted"});

      expect(deps.concierge.startTurn).not.toHaveBeenCalled();
      expect(deps.claimInbound).not.toHaveBeenCalled();
      expect(deps.recordOutboundEcho).toHaveBeenCalledWith({
        recipient: "+85290000000",
        text: "Thanks for writing in.",
        providerMessageId: "wamid.echo.1",
        origin: "MANUAL",
        sentAt: new Date(woztellOutboundEchoPayload.timestamp),
      });
    });

    it("refuses an echo whose recipient will not normalise", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellOutboundEchoPayload,
        to: "not-a-number",
      })).resolves.toEqual({status: "ignored", reason: "unnormalizable_sender"});
      expect(deps.recordOutboundEcho).not.toHaveBeenCalled();
    });
  });

  describe("classification of what used to be one silent arm", () => {
    it("names an unrecognised event, because 202 {\"ignored\"} said nothing", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellInboundTextPayload,
        type: "IMAGE",
      })).resolves.toEqual({status: "ignored", reason: "unsupported_event"});
      expect(deps.claimInbound).not.toHaveBeenCalled();
    });

    it("names an unnormalizable sender separately from an unrecognised event", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellInboundTextPayload,
        from: "hi",
      })).resolves.toEqual({status: "ignored", reason: "unnormalizable_sender"});
      expect(deps.claimInbound).not.toHaveBeenCalled();
    });
  });

  describe("the human lane", () => {
    it("persists and notifies without starting a bot turn", async () => {
      const deps = dependencies({
        claimInbound: vi.fn(async () => acceptedClaim({
          handling: "human",
          assignedToProfileId: "staff-a",
        })),
      });

      await expect(createWoztellWebhookProcessor(deps).process(woztellInboundTextPayload))
        .resolves.toEqual({status: "human_handled"});

      // claimInbound has already persisted the inbound row; the interlock is read
      // from the row it locked, so the bot cannot answer a message a person is
      // already answering.
      expect(deps.claimInbound).toHaveBeenCalledOnce();
      expect(deps.notifyAssignee).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        assignedToProfileId: "staff-a",
        locale: "en",
      });
      expect(deps.markCompleted).toHaveBeenCalledWith("wamid.inbound.member");
      expect(deps.recoverRun).not.toHaveBeenCalled();
      expect(deps.markRunOwned).not.toHaveBeenCalled();
      expect(deps.concierge.startTurn).not.toHaveBeenCalled();
      expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled();
    });

    it("still notifies when the member's marketing opt-in is false — persisting and notifying is not sending", async () => {
      const deps = dependencies({
        resolveProfile: vi.fn(async () => ({
          id: "profile-1",
          displayName: "Ada",
          locale: "en" as const,
          whatsappOptIn: false,
        })),
        claimInbound: vi.fn(async () => acceptedClaim({
          handling: "human",
          assignedToProfileId: "staff-a",
          profileId: "profile-1",
          owner: {kind: "profile", profileId: "profile-1"},
          whatsappOptIn: false,
        })),
      });

      // Under the pre-Task-4 order the `!whatsappOptIn` return fired first and
      // staff were simply never told the member had replied — the one case where
      // the inbox goes quiet for a reason nobody can see from the inside.
      await expect(createWoztellWebhookProcessor(deps).process(woztellInboundTextPayload))
        .resolves.toEqual({status: "human_handled"});
      expect(deps.notifyAssignee).toHaveBeenCalledOnce();
      expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled();
    });

    it("keeps the bot lane's opt-in gate for a bot-handled thread", async () => {
      const deps = dependencies({
        claimInbound: vi.fn(async () => acceptedClaim({whatsappOptIn: false})),
      });

      await expect(createWoztellWebhookProcessor(deps).process(woztellInboundTextPayload))
        .resolves.toEqual({status: "opted_out"});
      expect(deps.notifyAssignee).not.toHaveBeenCalled();
      expect(deps.concierge.startTurn).not.toHaveBeenCalled();
    });
  });

  describe("STOP outranks every other branch", () => {
    it("records an opt-out from a prospect who has no profile", async () => {
      const deps = dependencies();

      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellInboundTextPayload,
        data: {text: "Stop."},
      })).resolves.toEqual({status: "opted_out"});
      expect(deps.recordOptOut).toHaveBeenCalledWith({
        profileId: null,
        phoneE164: "+85290000000",
      });
      expect(deps.setWhatsappOptIn).not.toHaveBeenCalled();
    });

    it("records an opt-out from a member who is already opted out", async () => {
      const deps = dependencies({
        resolveProfile: vi.fn(async () => ({
          id: "profile-1",
          displayName: "Ada",
          locale: "en" as const,
          whatsappOptIn: false,
        })),
        claimInbound: vi.fn(async () => acceptedClaim({
          profileId: "profile-1",
          owner: {kind: "profile", profileId: "profile-1"},
          whatsappOptIn: false,
        })),
      });

      // The old order returned `opted_out` from the flag check before the STOP
      // branch ran, so a second withdrawal wrote no suppression at all.
      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellInboundTextPayload,
        data: {text: "UNSUBSCRIBE"},
      })).resolves.toEqual({status: "opted_out"});
      expect(deps.recordOptOut).toHaveBeenCalledOnce();
      expect(deps.setWhatsappOptIn).toHaveBeenCalledWith("profile-1", false);
    });

    it("outranks the human lane, so a staff-owned thread cannot swallow a withdrawal", async () => {
      const deps = dependencies({
        claimInbound: vi.fn(async () => acceptedClaim({
          handling: "human",
          assignedToProfileId: "staff-a",
        })),
      });

      await expect(createWoztellWebhookProcessor(deps).process({
        ...woztellInboundTextPayload,
        data: {text: "退訂"},
      })).resolves.toEqual({status: "opted_out"});
      expect(deps.recordOptOut).toHaveBeenCalledOnce();
      expect(deps.notifyAssignee).not.toHaveBeenCalled();
    });
  });

  describe("contact identity", () => {
    it("threads the member id and the new contact's id into the claim", async () => {
      const deps = dependencies();

      await createWoztellWebhookProcessor(deps).process(woztellInboundWithMemberIdPayload);

      expect(deps.recordContact).toHaveBeenCalledWith({
        phoneE164: "+85290000000",
        locale: "en",
        receivedAt: new Date(woztellInboundWithMemberIdPayload.timestamp),
        whatsappMemberId: "member-9001",
      });
      expect(deps.claimInbound).toHaveBeenCalledWith(expect.objectContaining({
        whatsappMemberId: "member-9001",
        contactId: "contact-1",
      }));
    });

    it("claims with a null contact link when the sender is a known member", async () => {
      const deps = dependencies({
        resolveProfile: vi.fn(async () => ({
          id: "profile-1",
          displayName: "Ada",
          locale: "en" as const,
          whatsappOptIn: true,
        })),
      });

      await createWoztellWebhookProcessor(deps).process(woztellInboundWithMemberIdPayload);

      expect(deps.recordContact).not.toHaveBeenCalled();
      expect(deps.claimInbound).toHaveBeenCalledWith(expect.objectContaining({
        contactId: null,
      }));
    });
  });
});
