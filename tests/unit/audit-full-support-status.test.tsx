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

it("keeps an expired queued lease uncertain while a live claim is still sending",()=>{
 const message={id:"synthetic-expired",role:"staff" as const,direction:"outbound" as const,channel:"whatsapp" as const,content:"Synthetic incomplete settlement",deliveryStatus:"queued" as const,templateKey:null,errorCode:null,createdAt:new Date("2026-10-01"),sendClaimExpiresAt:new Date("2020-01-01"),sendClaimLive:false};
 const html=renderToStaticMarkup(<InboxThread locale="en" transcript={{conversation,messages:[message]}} labels={labels}/>);expect(html).toContain(labels.delivery.uncertain);expect(html).not.toContain(labels.delivery.queued);
 const live=renderToStaticMarkup(<InboxThread locale="en" transcript={{conversation,messages:[{...message,sendClaimExpiresAt:new Date("2040-01-01"),sendClaimLive:true}]}} labels={labels}/>);expect(live).toContain(labels.delivery.queued);expect(live).not.toContain(labels.delivery.uncertain);
});
it("keeps provider-confirmed failed delivery separate from unknown acceptance",()=>{
 const message={id:"synthetic-known-failed",role:"staff" as const,direction:"outbound" as const,channel:"whatsapp" as const,content:"Synthetic known delivery refusal",deliveryStatus:"failed" as const,templateKey:null,errorCode:"provider_acceptance_uncertain",createdAt:new Date("2026-10-01"),providerMessageId:"synthetic-provider-receipt"};
 const html=renderToStaticMarkup(<InboxThread locale="en" transcript={{conversation,messages:[message]}} labels={labels}/>);expect(html).toContain(labels.delivery.failed);expect(html).not.toContain(labels.delivery.uncertain);
});
