import {describe, expect, it, vi} from "vitest";

import {createWoztellAdapter, CUSTOMER_SERVICE_WINDOW_MS} from "@/lib/channels/woztell";
import {
  woztellDeliveryStatusPayload,
  woztellEnv,
  woztellInboundTextPayload,
  woztellInboundWithMemberIdPayload,
  woztellOutboundEchoPayload,
} from "@/tests/fixtures/woztell";

function normalize(payload: unknown) {
  return createWoztellAdapter(woztellEnv, vi.fn()).normalizeInbound(payload);
}

const UNSUPPORTED_WITH_SENDER = {
  kind: "unsupported",
  sender: "85290000000",
  text: null,
  intent: null,
} as const;

describe("Woztell normaliser v2 (C-1, plan O-1)", () => {
  it("carries the Woztell member id on an inbound text, from either payload shape", () => {
    expect(normalize(woztellInboundWithMemberIdPayload)).toEqual({
      kind: "message",
      sender: "85290000000",
      text: "Hello",
      intent: null,
      providerMessageId: "wamid.inbound.member",
      receivedAt: new Date("2026-09-10T01:00:00.000Z"),
      whatsappMemberId: "member-9001",
    });

    expect(normalize({...woztellInboundTextPayload, member: {id: " member-9002 "}}))
      .toMatchObject({kind: "message", whatsappMemberId: "member-9002"});
  });

  it("reports no member id rather than an empty one when the payload has none", () => {
    // Every payload shape before Phase C is the member-less one. A "" here would
    // be written into conversations.whatsapp_member_id and would then match the
    // next member-less sender.
    expect(normalize(woztellInboundTextPayload))
      .toMatchObject({kind: "message", whatsappMemberId: null});
    expect(normalize({...woztellInboundTextPayload, memberId: "   "}))
      .toMatchObject({kind: "message", whatsappMemberId: null});
  });

  it("routes opt-out through the shared vocabulary instead of an inline STOP test", () => {
    for (const text of ["STOP", " Stop. ", "退訂", "取消訂閱", "unsubscribe"]) {
      expect(normalize({...woztellInboundTextPayload, data: {text}}), text)
        .toMatchObject({kind: "message", intent: "opt_out"});
    }
    for (const text of ["stop sending me the newsletter", "取消我的活動報名"]) {
      expect(normalize({...woztellInboundTextPayload, data: {text}}), text)
        .toMatchObject({kind: "message", intent: null});
    }
  });

  it("normalises a delivery-status event into its own variant, lower-casing the status", () => {
    expect(normalize(woztellDeliveryStatusPayload)).toEqual({
      kind: "delivery_status",
      providerMessageId: "wamid.outbound.1",
      status: "delivered",
      errorCode: null,
      occurredAt: new Date("2026-09-10T01:05:00.000Z"),
    });

    expect(normalize({
      ...woztellDeliveryStatusPayload,
      data: {status: "failed", errorCode: "  131047  "},
    })).toMatchObject({kind: "delivery_status", status: "failed", errorCode: "131047"});
  });

  it("normalises an outbound echo, keeping the origin that decides who sent it", () => {
    expect(normalize(woztellOutboundEchoPayload)).toEqual({
      kind: "outbound_echo",
      recipient: "85290000000",
      text: "Thanks for writing in.",
      providerMessageId: "wamid.echo.1",
      origin: "MANUAL",
      sentAt: new Date("2026-09-10T01:06:00.000Z"),
    });

    expect(normalize({...woztellOutboundEchoPayload, origin: "BOT"}))
      .toMatchObject({kind: "outbound_echo", origin: "BOT"});
  });

  it("fails closed on a payload that only looks like one of the new kinds", () => {
    // O-1: both discriminators are guesses, so a near-miss must land on the
    // inert `unsupported` variant rather than on a half-populated event that a
    // writer would then persist. Hostile and safe samples, per AGENTS.md.
    const hostile: readonly unknown[] = [
      {...woztellDeliveryStatusPayload, messageId: "  "},
      {...woztellDeliveryStatusPayload, timestamp: "not-a-date"},
      {...woztellDeliveryStatusPayload, data: {status: "pending"}},
      {...woztellDeliveryStatusPayload, data: undefined},
      {type: "MESSAGE_STATUS", messageId: "wamid.x", timestamp: "2026-09-10T01:05:00.000Z"},
      {...woztellOutboundEchoPayload, origin: "SYSTEM"},
      {...woztellOutboundEchoPayload, data: {text: "   "}},
      {...woztellOutboundEchoPayload, to: ""},
      {...woztellOutboundEchoPayload, messageId: ""},
      // A non-string discriminator must not reach `String(...)`: String(Symbol())
      // throws, and a throw here is a 500 on the webhook route and a provider
      // retry loop, which is exactly the failure mode this variant exists to
      // avoid.
      {...woztellOutboundEchoPayload, origin: Symbol("BOT")},
      {...woztellDeliveryStatusPayload, data: {status: Symbol("delivered")}},
    ];
    for (const payload of hostile) {
      expect(normalize(payload), JSON.stringify(payload, (_key, value) => typeof value === "symbol" ? "<symbol>" : value))
        .toMatchObject({kind: "unsupported", text: null, intent: null});
    }
  });

  it("leaves the two pinned unsupported literals byte-identical", () => {
    // tests/unit/woztell-review-gaps.test.ts pins both; repeated here so a
    // normaliser change is caught by the normaliser's own suite too.
    expect(normalize(null)).toEqual({kind: "unsupported", sender: null, text: null, intent: null});
    expect(normalize({from: "85290000000", type: "IMAGE", data: {text: "STOP"}}))
      .toEqual(UNSUPPORTED_WITH_SENDER);
  });
});

describe("one customer-service window constant (Task 2, read by Tasks 7 and 8)", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const adapter = createWoztellAdapter({}, vi.fn(), () => now);
  const recipient = {whatsappOptIn: true, whatsappNumber: "85290000000"} as const;

  it("exports the constant the adapter itself enforces against", async () => {
    // Task 8's countdown and Task 7's pre-flight check import this rather than
    // retyping 24 * 60 * 60 * 1_000, so the UI cannot promise a window the
    // adapter will refuse. The proof is the boundary, not the number.
    await expect(adapter.sendSessionMessage({
      ...recipient,
      text: "Inside the window",
      idempotencyKey: "window:edge",
      lastCustomerMessageAt: new Date(now.getTime() - CUSTOMER_SERVICE_WINDOW_MS),
    })).resolves.toMatchObject({status: "sent"});

    await expect(adapter.sendSessionMessage({
      ...recipient,
      text: "One millisecond too late",
      idempotencyKey: "window:past",
      lastCustomerMessageAt: new Date(now.getTime() - CUSTOMER_SERVICE_WINDOW_MS - 1),
    })).resolves.toEqual({status: "blocked", reason: "outside_customer_service_window"});
  });
});
