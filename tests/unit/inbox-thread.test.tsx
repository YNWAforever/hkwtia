import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {InboxThread} from "@/components/admin/inbox-thread";
import type {InboxMessage, InboxTranscript} from "@/lib/db/repos/inbox";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * C1 Task 8 Step 1/Step 3.
 *
 * Two failures this pins, both of which read as fine in review:
 *
 *  - a staff reply rendered under `roles.user` is a reply attributed to the
 *    prospect who wrote in, in a thread whose whole purpose is to show who said
 *    what;
 *  - a delivery tick drawn as a glyph alone is invisible to a screen reader and
 *    ambiguous to everyone else, so the status is rendered as TEXT from the
 *    bundle and a failed row carries its provider error code beside it — the one
 *    string that tells staff whether to retry or to escalate.
 */
const labels = {
  roles: en.Admin.inbox.roles,
  delivery: en.Admin.inbox.delivery,
};

const conversation: InboxTranscript["conversation"] = {
  id: "11111111-1111-4111-8111-111111111111",
  channel: "whatsapp",
  locale: "en",
  status: "active",
  handling: "human",
  ownerLabel: null,
  profileId: null,
  contactId: "22222222-2222-4222-8222-222222222222",
  assignedToProfileId: null,
  assigneeLabel: null,
  lastMessage: "On my way",
  lastMessageAt: new Date("2026-09-10T03:00:00.000Z"),
  lastInboundAt: new Date("2026-09-10T01:00:00.000Z"),
  lastStaffReadAt: null,
  unread: true,
  messageCount: 3,
  escalated: false,
};

function message(overrides: Partial<InboxMessage>): InboxMessage {
  return {
    id: "m1",
    role: "user",
    direction: "inbound",
    channel: "whatsapp",
    content: "Hello",
    deliveryStatus: null,
    templateKey: null,
    errorCode: null,
    createdAt: new Date("2026-09-10T01:00:00.000Z"),
    ...overrides,
  };
}

function markup(messages: readonly InboxMessage[]): string {
  return renderToStaticMarkup(
    <InboxThread labels={labels} locale="en" transcript={{conversation, messages}} />,
  );
}

describe("InboxThread", () => {
  it("labels a staff reply as staff, not as the sender", () => {
    const html = markup([
      message({id: "m1", role: "user", content: "Can I still join?"}),
      message({id: "m2", role: "assistant", direction: "outbound", content: "Yes — memberships are open."}),
      message({
        id: "m3",
        role: "staff",
        direction: "outbound",
        content: "I have reserved you a seat.",
        deliveryStatus: "delivered",
      }),
    ]);
    expect(html).toContain(en.Admin.inbox.roles.staff);
    expect(html).toContain(en.Admin.inbox.roles.assistant);
    // The staff row must not be attributed to the prospect. `roles.user` still
    // appears once, for the inbound row that really is theirs.
    expect(html.split(en.Admin.inbox.roles.user).length - 1).toBe(1);
  });

  it("renders the delivery state as readable text, never as a bare glyph", () => {
    const html = markup([
      message({id: "m2", role: "staff", direction: "outbound", deliveryStatus: "read"}),
    ]);
    expect(html).toContain(en.Admin.inbox.delivery.read);
  });

  it("shows nothing about delivery for a row that has no delivery state", () => {
    // Every inbound row and every web row: NULL means "not in the delivery
    // ledger", not "unknown", so a tick of any kind would be an invention.
    const html = markup([message({id: "m1"})]);
    for (const status of Object.values(en.Admin.inbox.delivery)) {
      expect(html, status).not.toContain(status);
    }
  });

  it("puts the provider's error code beside a failed reply", () => {
    const html = markup([
      message({
        id: "m4",
        role: "staff",
        direction: "outbound",
        deliveryStatus: "failed",
        errorCode: "provider_client_error",
      }),
    ]);
    expect(html).toContain(en.Admin.inbox.delivery.failed);
    expect(html).toContain("provider_client_error");
  });

  it("aligns by direction rather than by role", () => {
    // A `role='tool'` row is outbound and a `role='user'` row is inbound, but the
    // classification the reader cares about is which way the message travelled —
    // and 0031 gave `messages` a column that says so rather than a role to infer
    // it from.
    const inbound = markup([message({id: "m1", role: "user", direction: "inbound"})]);
    const outbound = markup([message({id: "m2", role: "user", direction: "outbound"})]);
    expect(inbound).not.toBe(outbound);
    expect(outbound).toContain("ml-auto");
    expect(inbound).not.toContain("ml-auto");
  });

  it("has a Chinese label for every role and delivery state it can render", () => {
    expect(Object.keys(zh.Admin.inbox.roles).sort()).toEqual(Object.keys(en.Admin.inbox.roles).sort());
    expect(Object.keys(zh.Admin.inbox.delivery).sort()).toEqual(Object.keys(en.Admin.inbox.delivery).sort());
  });
});
