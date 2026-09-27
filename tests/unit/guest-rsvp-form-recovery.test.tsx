import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const actionState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {...actual, useActionState: (_action: unknown, initial: unknown) => [actionState.current ?? initial, vi.fn(), false]};
});

import {GuestRsvpForm} from "@/components/marketing/guest-rsvp-form";

const labels = {
  title: "Reserve a place", name: "Name", email: "Email address", organisation: "Organisation", whatsappNumber: "WhatsApp number",
  marketingConsent: "Updates", consent: "Consent text", website: "Leave this field empty", submit: "Register", submitting: "Registering",
  registered: "Registered", waitlist: "Waitlisted", already: "Already registered", confirmationPending: "Saved; email pending",
  invalid: "Check your details", rateLimited: "Try later", closed: "Closed", external: "External", unavailable: "Unavailable",
  requiredField: "This field is required", invalidField: "Enter a valid value", invalidEmail: "Enter a valid email address",
  invalidWhatsapp: "Enter a valid WhatsApp number", errorReference: "Reference",
};

function form() {
  return <GuestRsvpForm action={vi.fn()} eventId="22222222-2222-4222-8222-222222222222" locale="en" labels={labels} />;
}

describe("guest RSVP form recovery", () => {
  beforeEach(() => { actionState.current = null; });

  it("retains entered values, marks the invalid field and focuses the first error", () => {
    const view = render(form());
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Ada"}});
    fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "bad-address"}});
    actionState.current = {status: "invalid", fieldErrors: {email: "invalid"}};
    view.rerender(form());

    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Email address")).toHaveValue("bad-address");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid email address")).toHaveAttribute("id", "guest-rsvp-email-error");
    expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
  });

  it("shows a recoverable error reference without dropping the form", () => {
    actionState.current = {status: "unavailable", errorId: "safe-id-123"};
    render(form());
    expect(screen.getByText(/Reference safe-id-123/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Register"})).toBeEnabled();
  });
});
