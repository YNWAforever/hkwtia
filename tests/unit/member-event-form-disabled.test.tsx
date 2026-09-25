import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/components/portal/hero-upload", () => ({HeroUpload: () => <div data-testid="hero-upload" />}));

import {EventForm} from "@/components/portal/event-form";

const labels = {
  saveDraft: "Save draft", submit: "Submit", saving: "Saving", errors: {},
  formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"},
  visibilities: {public: "Public", members_only: "Members only"},
  registrationModes: {rsvp: "RSVP", external: "External"}, hero: {},
} as never;

describe("member event form availability", () => {
  it("passes the clicked Save draft intent to the action", async () => {
    const action = vi.fn(async (_state: unknown, formData: FormData) => ({status: "idle" as const}));
    render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    fireEvent.click(screen.getByRole("button", {name: "Save draft"}));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]?.[1].get("intent")).toBe("draft");
  });
  it("marks entered event details as unsaved for the company picker", () => {
    render(<EventForm action={async () => ({status: "idle"})} canSubmit labels={labels} values={null} />);
    const form = screen.getByRole("button", {name: "Submit"}).closest("form")!;
    expect(form.dataset.dirty).toBeUndefined();
    fireEvent.input(form.querySelector("input[name=slug]")!, {target: {value: "new-event"}});
    expect(form.dataset.dirty).toBe("true");
  });
  it("disables both write actions when membership is inactive", () => {
    render(<EventForm action={async () => ({status: "idle"})} canSaveDraft={false} canSubmit={false} labels={labels} values={null} />);
    expect(screen.getByRole("button", {name: "Save draft"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Submit"})).toBeDisabled();
    expect(screen.queryByTestId("hero-upload")).toBeNull();
  });
});