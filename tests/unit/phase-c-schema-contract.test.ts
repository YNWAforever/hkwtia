import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {
  conversationHandlingEnum,
  conversations,
  messageDeliveryStatusEnum,
  messageDirectionEnum,
  messageRoleEnum,
  messages,
} from "@/lib/db/schema-core";
import {derivedConversationChannel} from "@/tests/fixtures/conversation-channel";
import {derivedMessageDirection} from "@/tests/fixtures/message-direction";

describe("phase C1 conversation operations contract", () => {
  it("gives a conversation a channel, a handling state and a staff assignment", () => {
    for (const column of [
      "channel",
      "handling",
      "contactId",
      "assignedToProfileId",
      "whatsappMemberId",
      "lastInboundAt",
      "lastStaffReadAt",
      "subject",
    ] as const) {
      expect(conversations[column]).toBeDefined();
    }
    expect(conversationHandlingEnum.enumValues).toEqual(["bot", "human", "closed"]);
    expect(conversations.handling.notNull).toBe(true);
    expect(conversations.channel.notNull).toBe(true);
  });

  it("leaves the two-armed owner check alone (D-6: the HMAC stays the owner key)", () => {
    const names = getTableConfig(conversations).checks.map((check) => check.name);
    expect(names).toContain("conversations_owner_check");
    expect(names).not.toContain("conversations_contact_owner_check");
  });

  it("gives a message a direction, a delivery status and a staff sender", () => {
    for (const column of [
      "direction",
      "deliveryStatus",
      "sentByProfileId",
      "templateKey",
      "errorCode",
      "deliveredAt",
      "readAt",
      "outboundKey",
      "sendClaimExpiresAt",
    ] as const) {
      expect(messages[column]).toBeDefined();
    }
    expect(messageDirectionEnum.enumValues).toEqual(["inbound", "outbound"]);
    expect(messageDeliveryStatusEnum.enumValues).toEqual(["queued", "sent", "delivered", "read", "failed"]);
    expect(messages.direction.notNull).toBe(true);
    expect(messages.deliveryStatus.notNull).toBe(false);
  });

  it("appends 'staff' to message_role without disturbing the existing values", () => {
    expect(messageRoleEnum.enumValues).toEqual(["user", "assistant", "tool", "staff"]);
  });

  it("indexes the write-ahead key partially, because a queued row has no provider id yet", () => {
    const names = getTableConfig(messages).indexes.map((index) => index.config.name);
    expect(names).toContain("messages_outbound_key_unique");
    expect(names).toContain("messages_provider_message_id_unique");
  });

  it("derives direction the way migration 0032 does", () => {
    expect(derivedMessageDirection({role: "user"})).toBe("inbound");
    for (const role of ["assistant", "tool"] as const) expect(derivedMessageDirection({role})).toBe("outbound");
  });

  it("calls a conversation WhatsApp when any of its messages is, not only the newest", () => {
    const t = (iso: string) => new Date(iso);
    expect(derivedConversationChannel([])).toBe("web");
    expect(derivedConversationChannel([{channel: "web", createdAt: t("2026-01-01T00:00:00Z")}])).toBe("web");
    // The row class this changes: a WhatsApp thread whose newest message is a
    // web reply. The old latest-message derivation in lib/db/repos/inbox.ts
    // called it "web", and the send path would then believe it may not use the
    // WhatsApp adapter for a thread that plainly is one.
    expect(derivedConversationChannel([
      {channel: "whatsapp", createdAt: t("2026-01-01T00:00:00Z")},
      {channel: "web", createdAt: t("2026-01-02T00:00:00Z")},
    ])).toBe("whatsapp");
  });
});
