import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import en from "@/messages/en.json";
import type {SeatBatchView, SeatBulkState} from "@/lib/portal/seat-bulk-contract";
const action = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal/seat-bulk-actions", () => ({seatBulkAction: action}));
import {SeatBulkInvite} from "@/components/portal/seat-bulk-invite";
const companyId = "11111111-1111-4111-8111-111111111111", batchId = "22222222-2222-4222-8222-222222222222", itemId = "33333333-3333-4333-8333-333333333333";
const view: SeatBatchView = {batchId, companyId, state: "preview", available: 4, canCommit: true, expiresAt: "2099-01-01T00:00:00.000Z", items: [
  {itemId, position: 1, email: "alice@example.test", role: "admin", state: "preview", code: null, retryable: false},
  {itemId: "44444444-4444-4444-8444-444444444444", position: 2, email: "alice@example.test", role: "member", state: "blocked", code: "DUPLICATE", retryable: false},
]};
const labels = en.Portal.seats.bulk;
beforeEach(() => {vi.clearAllMocks(); window.history.replaceState(null, "", "/portal/company/seats");});
afterEach(() => vi.restoreAllMocks());
function submitButton(button: HTMLElement) {
  // This repository's jsdom lacks SubmitEvent.submitter. Supply the browser event field
  // explicitly; product code still reads the clicked button and real FormData controls.
  const event = new Event("submit", {bubbles: true, cancelable: true});
  Object.defineProperty(event, "submitter", {value: button});
  fireEvent(button.closest("form")!, event);
}
describe("seat invitation batch preview and results", () => {
  it("submits selected snapshot IDs, explicit elevated-role consent and the same request key on retry", async () => {
    action.mockResolvedValue({status: "error", code: "capacity", view} satisfies SeatBulkState);
    render(<SeatBulkInvite companyId={companyId} locale="en" initialView={view} labels={labels} supportHref="/contact"/>);
    expect(screen.getAllByRole("checkbox")[1]).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {name: labels.confirmElevated}));
    await act(async () => {submitButton(screen.getByRole("button", {name: labels.commit}));});
    await screen.findByRole("alert");
    const form = action.mock.calls[0][1] as FormData;
    expect(form.get("operation")).toBe("commit"); expect(form.getAll("itemId")).toEqual([itemId]);
    expect(form.get("confirmElevated")).toBe("on"); expect(form.get("requestId")).toBe(batchId);
    await act(async () => {submitButton(screen.getByRole("button", {name: labels.commit}));});
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect((action.mock.calls[1][1] as FormData).get("requestId")).toBe(batchId);
    expect(new URL(window.location.href).searchParams.get("batchId")).toBe(batchId);
  });
  it("shows uncertainty with support and offers no retry for that item", () => {
    render(<SeatBulkInvite companyId={companyId} locale="en" initialView={{...view, state: "committed", items: [{...view.items[0], state: "uncertain", code: "DELIVERY_UNCERTAIN"}]}} labels={labels} supportHref="/contact"/>);
    expect(screen.getByText(labels.uncertainty)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: labels.retry})).toBeNull();
    expect(screen.getByRole("link", {name: labels.support})).toHaveAttribute("href", "/contact");
  });
  it("confirms cancellation of unstarted work before calling the action", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SeatBulkInvite companyId={companyId} locale="en" initialView={{...view, state: "committed", items: [{...view.items[0], state: "pending"}]}} labels={labels} supportHref="/contact"/>);
    submitButton(screen.getByRole("button", {name: labels.cancel}));
    expect(confirm).toHaveBeenCalledWith(labels.cancelConfirm); expect(action).not.toHaveBeenCalled();
  });
});
