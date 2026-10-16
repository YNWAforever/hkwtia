import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SupportFollowUpForm } from "@/components/admin/support-follow-up-form";
import type { SupportFollowUpState } from "@/lib/admin/support-followup-types";
import en from "@/messages/en.json";
const value = {
  version: "0",
  ownerProfileId: null,
  dueAt: null,
  nextActionCode: "none" as const,
  handling: "human" as const,
  closeReason: null,
  applicationId: null,
  billingAttemptId: null,
  supportReference: null,
  handoffNote: "",
  timeline: [],
};
const labels = {
  title: "Support follow-up",
  owner: "Owner",
  unassigned: "Unassigned",
  due: "Due (Hong Kong)",
  next: "Next step",
  handling: "Handling",
  closeReason: "Close reason",
  noClose: "Choose reason",
  application: "Application reference",
  billing: "Payment reference",
  reference: "Support reference",
  note: "Handoff note",
  privacy: "No tokens or login URLs",
  save: "Save follow-up",
  saving: "Saving",
  saved: "Saved",
  conflict: "Another administrator changed this case; reload to reconcile",
  invalid: "Check inputs",
  unavailable: "Unavailable",
  reload: "Reload case",
  nextActions: {
    none: "No next step",
    reply: "Reply",
    await_member: "Wait",
    identity_support: "Identity",
    payment_reconciliation: "Reconcile payment",
    delivery_reconciliation: "Reconcile delivery",
    handoff: "Handoff",
    follow_up_complete: "Complete",
  },
  handlingValues: en.Admin.inbox.handling,
  closeReasons: {
    resolved: "Resolved",
    member_withdrew: "Withdrawn",
    duplicate: "Duplicate",
    escalated: "Escalated",
  },
};
it("retains a handoff note and exposes recoverable conflict after a stale save", async () => {
  const action = vi.fn(
    async (state: SupportFollowUpState, data: FormData) => {void state;void data;return {status:"error" as const,code:"conflict" as const};},
  );
  render(
    <SupportFollowUpForm
      conversationId="19000000-0000-4000-8000-000000000001"
      value={value}
      owners={[{ id: "staff", name: "Synthetic staff" }]}
      labels={labels}
      channel="whatsapp"
      action={action}
    />,
  );
  fireEvent.change(screen.getByLabelText(labels.note), {
    target: { value: "Synthetic next administrator context" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: labels.save }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(labels.conflict),
  );
  expect(screen.getByLabelText(labels.note)).toHaveValue(
    "Synthetic next administrator context",
  );
  expect(screen.getByRole("button", { name: labels.reload })).toBeEnabled();
  expect(action.mock.calls[0][1].get("expectedVersion")).toBe("0");
  expect(action.mock.calls[0][1].get("expectedAssignedToProfileId")).toBe("");
});
it("requires an audited reason when closing and gives every field a native accessible name", () => {
  render(
    <SupportFollowUpForm
      conversationId="19000000-0000-4000-8000-000000000001"
      value={value}
      owners={[]}
      labels={labels}
      channel="whatsapp"
      action={async () => ({ status: "saved" })}
    />,
  );
  fireEvent.change(screen.getByLabelText(labels.handling), {
    target: { value: "closed" },
  });
  expect(screen.getByLabelText(labels.closeReason)).toBeRequired();
  expect(screen.getByLabelText(labels.note)).toBeRequired();
  expect(screen.getByLabelText(labels.next)).toHaveValue("follow_up_complete");
});
