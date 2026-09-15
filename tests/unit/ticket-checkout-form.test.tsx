import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const reactState = vi.hoisted(() => ({
  results: [] as Array<readonly [unknown, (formData: FormData) => void, boolean]>,
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  reactState.useActionState.mockImplementation((action: (formData: FormData) => void, initial: unknown) =>
    reactState.results.shift() ?? [initial, action, false]);
  return {...actual, useActionState: reactState.useActionState};
});

// The form binds to the real Server Action; this suite renders the client half only.
vi.mock("@/lib/tickets/checkout-actions", () => ({submitTicketCheckoutAction: vi.fn()}));

import {TicketCheckoutForm, type TicketCheckoutLabels} from "@/components/marketing/ticket-checkout-form";

const labels: TicketCheckoutLabels = {
  heading: "Buy tickets",
  buyerName: "Your name",
  buyerEmail: "Your email address",
  seatCount: "Number of seats",
  attendeeName: "Attendee name",
  attendeeEmail: "Attendee email",
  website: "Leave this field empty",
  pricePerSeat: "Price per seat",
  submit: "Buy tickets",
  submitting: "Redirecting to payment…",
  errors: {
    INVALID: "Check the form.",
    SOLD_OUT: "This event is sold out.",
    EVENT_CLOSED: "Ticket sales have closed.",
    UNAVAILABLE: "Ticket sales are unavailable right now.",
    RATE_LIMITED: "Too many attempts. Try again shortly.",
  },
};

function renderForm(overrides: Partial<Parameters<typeof TicketCheckoutForm>[0]> = {}) {
  return render(<TicketCheckoutForm
    eventId="10000000-0000-4000-8000-000000000001"
    labels={labels}
    locale="en"
    pricePerSeat="Price per seat: HK$250.00"
    {...overrides}
  />);
}

describe("TicketCheckoutForm", () => {
  beforeEach(() => {
    reactState.results = [];
    reactState.useActionState.mockClear();
  });

  it("renders one attendee name and email row per selected seat", () => {
    renderForm();

    expect(screen.getByText("Attendee name 1")).toBeInTheDocument();
    expect(screen.queryByText("Attendee name 2")).toBeNull();

    fireEvent.change(screen.getByLabelText(labels.seatCount), {target: {value: "3"}});

    for (const seat of [1, 2, 3]) {
      expect(screen.getByText(`Attendee name ${seat}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Attendee email ${seat}`)).toBeInTheDocument();
    }
    expect(screen.queryByText("Attendee name 4")).toBeNull();
  });

  it("prefills the buyer name and email for a signed-in member", () => {
    renderForm({defaultBuyerEmail: "ada@example.hk", defaultBuyerName: "Ada Lovelace"});

    expect(screen.getByLabelText(labels.buyerName)).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText(labels.buyerEmail)).toHaveValue("ada@example.hk");
  });

  it("disables the submit button while the checkout is pending", () => {
    reactState.results.push([{status: "idle"}, vi.fn(), true]);

    renderForm();

    expect(screen.getByRole("button", {name: labels.submitting})).toBeDisabled();
  });

  it("renders a localized error for a refused checkout", () => {
    reactState.results.push([{status: "error", code: "SOLD_OUT"}, vi.fn(), false]);

    renderForm();

    expect(screen.getByRole("alert")).toHaveTextContent(labels.errors.SOLD_OUT);
  });
});
