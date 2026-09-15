import {fireEvent, render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const reactState = vi.hoisted(() => ({
  results: [] as Array<readonly [unknown, (formData: FormData) => void, boolean]>,
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // Reads the queued result rather than shifting it: the form re-renders once
  // after mount (the idempotency-key effect), and a shift would consume the
  // queued state on the first render and hand the re-render the idle default.
  reactState.useActionState.mockImplementation((action: (formData: FormData) => void, initial: unknown) =>
    reactState.results[0] ?? [initial, action, false]);
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

  it("mints the idempotency key after mount so the server and client markup agree", () => {
    const {container} = renderForm();

    const hidden = container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]');
    expect(hidden?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // The server render must not mint a key: a value produced during render differs
  // between server and client (a hydration mismatch), and `crypto.randomUUID` is
  // secure-context only. The form therefore mints after mount and cannot submit
  // until it has, which the server's `z.string().uuid()` requires.
  it("cannot be submitted before the key is minted", () => {
    const markup = renderToStaticMarkup(
      <TicketCheckoutForm eventId="10000000-0000-4000-8000-000000000001" labels={labels} locale="en" pricePerSeat="Price per seat: HK$250.00" />,
    );

    expect(markup).toContain('name="idempotencyKey"');
    expect(markup).toMatch(/<input[^>]*name="idempotencyKey"[^>]*value=""/);
    expect(markup).toMatch(/<button[^>]*\bdisabled\b/);
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
