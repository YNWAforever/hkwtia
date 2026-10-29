import {act, fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {JoinFormState} from "@/components/join/join-form";

const actionState = vi.hoisted(() => ({
  value: {} as JoinFormState,
  pending: false,
  run: null as null | ((previous: JoinFormState, data: FormData) => Promise<JoinFormState>),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (action: typeof actionState.run) => {
    actionState.run = action;
    return [actionState.value, vi.fn(), actionState.pending];
  },
}));
import {JoinForm} from "@/components/join/join-form";

function formElement(action: (previous: JoinFormState, data: FormData) => Promise<JoinFormState> = vi.fn(async (): Promise<JoinFormState> => ({fieldErrors: {phone: "Use a valid phone"}}))) {
  return (<JoinForm action={action} fieldNames={["phone"]} submitLabel="Continue" pendingLabel="Saving">
    <label htmlFor="displayName">Name</label><input id="displayName" name="displayName" defaultValue="Saved name"/>
    <details><summary>Optional contact details</summary>
      <label htmlFor="phone">Phone</label><input id="phone" name="phone" aria-describedby="phone-error"/>
    </details>
  </JoinForm>);
}
function form(action?: (previous: JoinFormState, data: FormData) => Promise<JoinFormState>) {
  return render(formElement(action));
}

describe("join form recovery", () => {
  beforeEach(() => {actionState.value = {}; actionState.run = null; actionState.pending = false;});

  it("preserves the server action reference for submission before hydration", () => {
    const action = vi.fn(async () => ({}));
    form(action);
    expect(actionState.run).toBe(action);
  });

  it("preserves values if the browser resets while the action is still pending", () => {
    actionState.pending = true;
    const {container} = form();
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "New member name"}});
    container.querySelector("form")!.reset();
    expect(screen.getByLabelText("Name")).toHaveValue("New member name");
  });

  it("preserves values when a fast submission resets before pending or the error state renders", async () => {
    const {container, rerender} = form();
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "New member name"}});
    fireEvent.submit(container.querySelector("form")!);
    container.querySelector("form")!.reset();
    expect(screen.getByLabelText("Name")).toHaveValue("New member name");
    await act(async () => {actionState.value = {message: "Unable to save"};});
    rerender(formElement());
    expect(screen.getByLabelText("Name")).toHaveValue("New member name");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save");
  });

  it("still resets a successful fast submission after its result renders", async () => {
    const {container, rerender} = form();
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "New member name"}});
    fireEvent.submit(container.querySelector("form")!);
    container.querySelector("form")!.reset();
    expect(screen.getByLabelText("Name")).toHaveValue("New member name");
    await act(async () => {actionState.value = {};});
    rerender(formElement());
    expect(screen.getByLabelText("Name")).toHaveValue("Saved name");
  });

  it("opens the optional section and focuses the first invalid field after server validation", () => {
    actionState.value = {fieldErrors: {phone: "Use a valid phone"}};
    const {container} = form();
    expect(container.querySelector("details")?.open).toBe(true);
    expect(screen.getByLabelText("Phone")).toHaveFocus();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Use a valid phone");
  });

  it("preserves entered values when React requests a reset after a rejected submission", async () => {
    const {container, rerender} = form();
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "New member name"}});
    await act(async () => {actionState.value = await actionState.run!({}, new FormData());});
    rerender(formElement());
    container.querySelector("form")!.reset();
    expect(screen.getByLabelText("Name")).toHaveValue("New member name");
  });

  it("allows a successful submission to reset normally", async () => {
    const {container} = form(vi.fn(async () => ({})));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "New member name"}});
    await act(async () => {await actionState.run!({}, new FormData());});
    container.querySelector("form")!.reset();
    expect(screen.getByLabelText("Name")).toHaveValue("Saved name");
  });
});
