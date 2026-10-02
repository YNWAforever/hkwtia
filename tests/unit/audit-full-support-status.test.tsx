import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InboxThread } from "@/components/admin/inbox-thread";
import type { InboxTranscript } from "@/lib/db/repos/inbox";
import en from "@/messages/en.json";
const labels = {
  roles: en.Admin.inbox.roles,
  delivery: {
    ...en.Admin.inbox.delivery,
    uncertain: "Delivery uncertain; reconcile first",
  },
};
const conversation = {
  id: "19000000-0000-4000-8000-000000000001",
  channel: "whatsapp",
  locale: "en",
  status: "active",
  handling: "human",
  ownerLabel: "Synthetic member",
  profileId: "synthetic",
  contactId: null,
  assignedToProfileId: null,
  assigneeLabel: null,
  lastMessage: null,
  lastMessageAt: null,
  lastInboundAt: null,
  lastStaffReadAt: null,
  unread: false,
  messageCount: 1,
  escalated: false,
} as const;
it("displays an accepted-response timeout as uncertain rather than definitively not delivered", () => {
  const transcript: InboxTranscript = {
    conversation,
    messages: [
      {
        id: "synthetic-message",
        role: "staff",
        direction: "outbound",
        channel: "whatsapp",
        content: "Synthetic reply",
        deliveryStatus: "failed",
        templateKey: null,
        errorCode: "retryable_network",
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ],
  };
  const html = renderToStaticMarkup(
    <InboxThread locale="en" transcript={transcript} labels={labels} />,
  );
  expect(html).toContain(labels.delivery.uncertain);
  expect(html).not.toContain(labels.delivery.failed);
});
it("keeps a definitive provider rejection as not delivered", () => {
  const transcript: InboxTranscript = {
    conversation,
    messages: [
      {
        id: "synthetic-message",
        role: "staff",
        direction: "outbound",
        channel: "whatsapp",
        content: "Synthetic reply",
        deliveryStatus: "failed",
        templateKey: null,
        errorCode: "provider_client_error",
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ],
  };
  const html = renderToStaticMarkup(
    <InboxThread locale="en" transcript={transcript} labels={labels} />,
  );
  expect(html).toContain(labels.delivery.failed);
  expect(html).not.toContain(labels.delivery.uncertain);
});
