import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {SeatOperationForm} from "@/components/portal/seat-operation-form";
import {seatActionErrorKeys, type SeatActionState, type SeatFeedbackLabels} from "@/lib/portal/seat-action-state";
const labels: SeatFeedbackLabels = {pending: "Working", success: "Saved", errors: Object.fromEntries(seatActionErrorKeys.map((key) => [key, key])) as SeatFeedbackLabels["errors"]};
afterEach(() => vi.restoreAllMocks());
describe("seat operation form", () => {
  it("confirms a named revocation before sending any action", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const action = vi.fn(async (): Promise<SeatActionState> => ({status: "success"}));
    render(<SeatOperationForm action={action} labels={labels} submitLabel="Revoke" confirmation="Revoke Alice?"><input name="memberId" value="member" readOnly/></SeatOperationForm>);
    fireEvent.submit(screen.getByRole("button", {name: "Revoke"}).closest("form")!);
    expect(confirm).toHaveBeenCalledWith("Revoke Alice?"); expect(action).not.toHaveBeenCalled();
  });
  it("prevents double submission, retains input on failure, and shows a specific result", async () => {
    let resolve!: (result: SeatActionState) => void;
    const action = vi.fn(() => new Promise<SeatActionState>((done) => {resolve = done;}));
    render(<SeatOperationForm action={action} labels={labels} submitLabel="Invite"><input aria-label="Email" name="email" defaultValue="person@example.test"/></SeatOperationForm>);
    const form = screen.getByRole("button").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("button", {name: "Working"})).toBeDisabled());
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => resolve({status: "error", code: "deliveryUncertain"}));
    expect(screen.getByRole("alert")).toHaveTextContent("deliveryUncertain");
    expect(screen.getByRole("textbox")).toHaveValue("person@example.test");
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
