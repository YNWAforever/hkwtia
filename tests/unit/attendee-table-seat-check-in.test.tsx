import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {AttendeeTable} from "@/components/admin/attendee-table";
import type {EventActionState} from "@/lib/admin/event-action-core";

const seatId = "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f";

const labels = {
  caption: "Attendees",
  kind: "Type",
  kinds: {member: "Member", guest: "Guest", ticket: "Ticket"},
  name: "Name",
  email: "Email",
  organisation: "Organisation",
  status: "Status",
  checkedIn: "Checked in",
  checkIn: "Check in",
  checkingIn: "Checking in...",
  resendPass: "Resend pass",
  resending: "Sending pass...",
  unavailable: "Not available",
  statuses: {paid: "Paid"},
} as const;

const resendMessages = {successMessage: "Pass email sent.", errorMessage: "We could not send this pass email."} as const;

function ticketRow(overrides: Partial<{checkedInAt: Date | null; seatId: string | null}> = {}) {
  return {
    kind: "ticket" as const,
    profileId: null,
    guestId: null,
    seatId: overrides.seatId === undefined ? seatId : overrides.seatId,
    orderId: "order-1",
    displayName: "Ada Lovelace",
    email: "ada@example.test",
    organisation: null,
    status: "paid",
    checkedInAt: overrides.checkedInAt ?? null,
  };
}

function renderTable(seatCheckInAction: (state: EventActionState, formData: FormData) => Promise<EventActionState>, row = ticketRow()) {
  return render(<AttendeeTable
    attendees={[row]}
    checkInAction={async () => ({})}
    labels={labels}
    locale="en"
    resendPassMessages={resendMessages}
    resendPassPath="/en/admin/events-mgmt/event-1"
    seatCheckInAction={seatCheckInAction}
  />);
}

describe("the door list's ticket check-in fallback", () => {
  // Spec section 4.3: the door list carries a Check in action for a ticket seat
  // as the fallback when a pass cannot be produced (dead phone, lost email).
  // Without it the only way to admit a paid seat whose pass is unreachable is a
  // database change.
  it("renders a check-in control for a ticket row", () => {
    renderTable(async () => ({}));

    expect(screen.getByRole("button", {name: "Check in"})).toBeInTheDocument();
  });

  it("disables the check-in control once the seat is already checked in", () => {
    renderTable(async () => ({}), ticketRow({checkedInAt: new Date("2026-09-16T01:00:00.000Z")}));

    expect(screen.getByRole("button", {name: "Check in"})).toBeDisabled();
  });

  it("submits the row's seat id to the seat check-in action", async () => {
    const seatCheckInAction = vi.fn(async (_state: EventActionState, _formData: FormData): Promise<EventActionState> => ({}));
    renderTable(seatCheckInAction);

    fireEvent.submit(screen.getByRole("button", {name: "Check in"}).closest("form")!);

    await waitFor(() => expect(seatCheckInAction).toHaveBeenCalledTimes(1));
    const formData = seatCheckInAction.mock.calls[0]![1];
    expect(formData.get("seatId")).toBe(seatId);
  });
});
