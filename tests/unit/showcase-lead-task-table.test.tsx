import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {TaskTable} from "@/components/admin/task-table";

describe("staff task queue", () => {
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
        leadAck: "Acknowledgement", leadStaff: "Staff notification"}}
      action={vi.fn(async () => undefined)}
    />);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Showcase introduction email")).toBeInTheDocument();
    expect(screen.getByText("Email delivery status is uncertain")).toBeInTheDocument();
    expect(screen.getByText("Acknowledgement")).toBeInTheDocument();
  });
});
