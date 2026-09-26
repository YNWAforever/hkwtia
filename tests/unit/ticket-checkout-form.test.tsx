import {act, fireEvent, render, screen} from "@testing-library/react";
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
vi.mock("@/lib/tickets/checkout-actions", () => ({submitTicketCheckoutAction: vi.fn(), resumeTicketCheckoutAction: vi.fn()}));

import {TicketCheckoutForm, type TicketCheckoutLabels} from "@/components/marketing/ticket-checkout-form";
import {submitTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";

const labels: TicketCheckoutLabels = {
  heading: "Buy tickets",
  buyerName: "Your name",
  buyerEmail: "Your email address",
  seatCount: "Number of seats",
  attendeeName: "Attendee name",
  attendeeEmail: "Attendee email",
  website: "Leave this field empty",
  submit: "Buy tickets",
  submitting: "Redirecting to payment…",
  refundPolicy: "Refund policy",
  fillBuyer: "I am also attending",
  removeSeat: "Remove attendee",
  total: "Total",
  paymentNature: "One-time ticket payment. Seats are confirmed after payment.",
  eventDate: "Event date",
  fieldErrors: {required: "Required", invalid: "Invalid", extra: "Extra attendee"},
  recoveryLoading: "Checking previous checkout",
  recoveryTitle: "Pending checkout",
  recoverySummary: "Reserved seats",
  recoveryResume: "Continue existing payment",
  recoveryChecking: "Checking payment",
  recoveryUnavailable: "Checkout status unavailable",
  errors: {
    INVALID: "Check the form.",
    SOLD_OUT: "This event is sold out.",
    EVENT_CLOSED: "Ticket sales have closed.",
    UNAVAILABLE: "Ticket sales are unavailable right now.",
    RETRY_CHANGED: "Purchase details changed; submit again to start a new checkout.",
    RETRY_EXPIRED: "The checkout attempt expired. Submit again to start a new checkout.",
    RATE_LIMITED: "Too many attempts. Try again shortly.",
  },
};

function renderForm(overrides: Partial<Parameters<typeof TicketCheckoutForm>[0]> = {}) {
  return render(<TicketCheckoutForm
    eventId="10000000-0000-4000-8000-000000000001"
    labels={labels}
    locale="en"
    pricePerSeat="Price per seat: HK$250.00"
    unitAmountHkdCents={25000}
    refundPolicyHref="/refund-policy"
    {...overrides}
  />);
}

describe("TicketCheckoutForm", () => {
  beforeEach(() => {
    reactState.results = [];
    reactState.useActionState.mockClear();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => undefined));
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

  it("submits the selected quantity and displays the computed total", () => {
    const view = renderForm();
    fireEvent.change(screen.getByLabelText(labels.seatCount), {target: {value: "3"}});
    expect(view.container.querySelector<HTMLSelectElement>('select[name="quantity"]')?.value).toBe("3");
    expect(screen.getByText(/HK\$750\.00/)).toBeInTheDocument();
    expect(screen.getByText(labels.paymentNature)).toBeInTheDocument();
  });

  it("copies buyer details to seat one and can explicitly remove another attendee", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(labels.buyerName), {target: {value: "Ada Lovelace"}});
    fireEvent.change(screen.getByLabelText(labels.buyerEmail), {target: {value: "ada@example.test"}});
    fireEvent.click(screen.getByRole("button", {name: labels.fillBuyer}));
    expect(screen.getByLabelText("Attendee name 1")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Attendee email 1")).toHaveValue("ada@example.test");
    fireEvent.change(screen.getByLabelText(labels.seatCount), {target: {value: "3"}});
    fireEvent.click(screen.getAllByRole("button", {name: labels.removeSeat})[1]);
    expect(screen.queryByText("Attendee name 3")).toBeNull();
    expect(screen.getByLabelText(labels.seatCount)).toHaveValue("2");
  });

  it("reopens a pending attempt after mount and hides the new purchase controls", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({eventId: "10000000-0000-4000-8000-000000000001", status: "pending", seatCount: 3, amountHkdCents: 75000, expiresAt: "2030-01-01T00:00:00.000Z"}), {status: 200}));
    renderForm();
    expect(await screen.findByText(labels.recoveryTitle)).toBeInTheDocument();
    expect(screen.getByText(/HK\$750\.00/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: labels.recoveryResume})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: labels.submit})).toBeNull();
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
      <TicketCheckoutForm eventId="10000000-0000-4000-8000-000000000001" labels={labels} locale="en" pricePerSeat="Price per seat: HK$250.00" unitAmountHkdCents={25000} refundPolicyHref="/refund-policy" />,
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

  it.each(["RETRY_CHANGED", "RETRY_EXPIRED"] as const)("starts a new key after a %s refusal", async (code) => {
    const view = renderForm();
    const first = view.container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value;
    vi.mocked(submitTicketCheckoutAction).mockResolvedValueOnce({status: "error", code});
    const action = reactState.useActionState.mock.calls[0]![0] as
      (state: TicketCheckoutState, data: FormData) => Promise<TicketCheckoutState>;
    await act(async () => { await action({status: "idle"}, new FormData()); });
    reactState.results[0] = [{status: "error", code}, vi.fn(), false];
    view.rerender(<TicketCheckoutForm eventId="10000000-0000-4000-8000-000000000001"
      labels={labels} locale="en" pricePerSeat="Price per seat: HK$250.00" unitAmountHkdCents={25000} refundPolicyHref="/refund-policy" />);
    const second = view.container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(screen.getByRole("alert")).toHaveTextContent(labels.errors[code]);
  });
  it("renders a localized error for a refused checkout", () => {
    reactState.results.push([{status: "error", code: "SOLD_OUT"}, vi.fn(), false]);

    renderForm();

    expect(screen.getByRole("alert")).toHaveTextContent(labels.errors.SOLD_OUT);
  });
});
