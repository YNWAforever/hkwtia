import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {TaskTable} from "@/components/admin/task-table";

describe("staff task queue", () => {
  it("names a ticket refund escalation and its order instead of treating it as a showcase email", () => {
    render(<TaskTable
      locale="en"
      tasks={[{
        id: "22222222-2222-4222-8222-222222222222",
        profileId: null, kind: "ticket_email", summaryCode: "ticket_email_uncertain",
        context: {orderId: "33333333-3333-4333-8333-333333333333", noticeKind: "refund"},
        status: "open", createdAt: new Date("2026-09-26T00:00:00Z"),
      }]}
      labels={{kind: "Kind", summary: "Summary", member: "Member", conversation: "Conversation",
        created: "Created", actions: "Actions", resolve: "Resolve", openConversation: "Open", empty: "Empty",
        leadEmail: "Showcase introduction email", leadEmailBlocked: "Lead blocked",
        leadEmailUncertain: "Lead uncertain", leadAck: "Acknowledgement", leadStaff: "Staff notification",
        ticketEmail: "Ticket email", ticketEmailBlocked: "Ticket email needs manual follow-up",
        ticketEmailUncertain: "Ticket email status is uncertain; check before resending",
        ticketRefundPending: "Refund is still pending at Stripe", ticketConfirmation: "Receipt",
        ticketPass: "Attendee pass", ticketRefund: "Refund notice", ticketRefundFailed: "Refund failure notice", ticketOrder: "Order"}}
      action={vi.fn(async () => undefined)}
    />);
    expect(screen.getByText("Ticket email")).toBeInTheDocument();
    expect(screen.getByText("Ticket email status is uncertain; check before resending")).toBeInTheDocument();
    expect(screen.getByText("Refund notice")).toBeInTheDocument();
    expect(screen.getByText("33333333-3333-4333-8333-333333333333")).toBeInTheDocument();
  });

  it("shows the contact address for a showcase email delivery escalation", () => {
    render(<TaskTable
      locale="en"
      tasks={[{
        id: "11111111-1111-4111-8111-111111111111",
        profileId: null,
        kind: "showcase_lead_email",
        summaryCode: "showcase_lead_email_uncertain",
        context: {contactEmail: "ada@example.com", locale: "en", noticeKind: "ack"},
        status: "open",
        createdAt: new Date("2026-09-26T00:00:00Z"),
      }]}
      labels={{kind: "Kind", summary: "Summary", member: "Member", conversation: "Conversation",
        created: "Created", actions: "Actions", resolve: "Resolve",
        openConversation: "Open", empty: "Empty", leadEmail: "Showcase introduction email",
        leadEmailBlocked: "Email delivery needs manual follow-up",
        leadEmailUncertain: "Email delivery status is uncertain",
        leadAck: "Acknowledgement", leadStaff: "Staff notification", ticketEmail: "Ticket email",
        ticketEmailBlocked: "Ticket email needs manual follow-up", ticketEmailUncertain: "Ticket email status is uncertain",
        ticketRefundPending: "Refund pending", ticketConfirmation: "Receipt", ticketPass: "Attendee pass",
        ticketRefund: "Refund notice", ticketRefundFailed: "Refund failure notice", ticketOrder: "Order"}}
      action={vi.fn(async () => undefined)}
    />);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Showcase introduction email")).toBeInTheDocument();
    expect(screen.getByText("Email delivery status is uncertain")).toBeInTheDocument();
    expect(screen.getByText("Acknowledgement")).toBeInTheDocument();
  });
});
