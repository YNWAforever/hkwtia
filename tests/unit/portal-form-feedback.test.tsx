import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {PortalForm, PortalInput, PortalSubmit} from "@/components/portal/forms/portal-form";
import type {PortalFormState} from "@/lib/portal/form-state";

const labels = {save: "Save", saving: "Saving…", success: "Saved", validation_error: "Check your details", forbidden: "Your access has changed", conflict: "Reload before saving", unavailable: "Could not save; try again", fields: {invalid: "Check this value", required: "Enter a number", invalid_number: "Enter a valid number"}};
function Form({action}: {action: (state: PortalFormState, data: FormData) => Promise<PortalFormState>}) {
  return <PortalForm action={action} labels={labels}>
    <label htmlFor="name">Name</label><PortalInput id="name" name="displayName" defaultValue="Ada" />
    <label htmlFor="number">Number</label><PortalInput id="number" name="whatsappNumber" defaultValue="" />
    <PortalSubmit />
  </PortalForm>;
}
describe("portal form feedback", () => {
  it("retains edited input, labels the invalid field and focuses it after validation failure", async () => {
    render(<Form action={async () => ({status: "validation_error", fieldErrors: {whatsappNumber: "required"}})} />);
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Edited Ada"}});
    fireEvent.submit(screen.getByRole("button", {name: "Save"}).closest("form")!);
    await screen.findByText("Enter a number");
    expect(screen.getByLabelText("Name")).toHaveValue("Edited Ada");
    expect(screen.getByLabelText("Number")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Number")).toHaveAccessibleDescription("Enter a number");
    // The validation message can commit before the passive focus effect runs.
    await waitFor(() => expect(screen.getByLabelText("Number")).toHaveFocus());
  });
  it("prevents duplicate writes and announces success only after the action resolves", async () => {
    let resolve!: (state: PortalFormState) => void;
    const action = vi.fn(() => new Promise<PortalFormState>((done) => {resolve = done;}));
    render(<Form action={action} />);
    const form = screen.getByRole("button", {name: "Save"}).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("button", {name: "Saving…"})).toBeDisabled());
    fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    await act(async () => {resolve({status: "success"});});
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("button", {name: "Save"})).toBeEnabled();
  });
});
