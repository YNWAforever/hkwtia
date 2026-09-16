import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

// The form binds to the real Server Action; this suite renders the client half only.
vi.mock("@/lib/tickets/checkout-actions", () => ({submitTicketCheckoutAction: vi.fn()}));

import {TicketCheckoutForm, type TicketCheckoutLabels} from "@/components/marketing/ticket-checkout-form";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

type Bundle = {Ticket: Record<string, unknown>};
const bundles: ReadonlyArray<readonly [string, Bundle]> = [
  ["en", en as unknown as Bundle],
  ["zh-HK", zhHK as unknown as Bundle],
];

/** The label must come from the bundle, so the assertion is on the bundle's own copy. */
function ticketLabel(locale: string): string {
  const bundle = bundles.find(([name]) => name === locale)?.[1];
  const value = bundle?.Ticket.refundPolicy;
  if (typeof value !== "string") throw new Error(`Ticket.refundPolicy missing for ${locale}`);
  return value;
}

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
  errors: {INVALID: "Check the form."},
};

function renderCheckout(overrides: Partial<Parameters<typeof TicketCheckoutForm>[0]> = {}) {
  return render(
    <TicketCheckoutForm
      eventId="10000000-0000-4000-8000-000000000001"
      labels={labels}
      locale="en"
      pricePerSeat="Price per seat: HK$250.00"
      refundPolicyHref="/refund-policy"
      {...overrides}
    />,
  );
}

describe("ticket refund-policy link", () => {
  it("renders an anchor at the localized refund-policy path it was given, labelled from Ticket", () => {
    renderCheckout({labels: {...labels, refundPolicy: ticketLabel("en")}});

    expect(screen.getByRole("link", {name: ticketLabel("en")})).toHaveAttribute("href", "/refund-policy");
  });

  it("carries the locale's own path so a zh-HK buyer reaches the Chinese policy", () => {
    renderCheckout({
      labels: {...labels, refundPolicy: ticketLabel("zh-HK")},
      locale: "zh-HK",
      refundPolicyHref: "/zh/refund-policy",
    });

    expect(screen.getByRole("link", {name: ticketLabel("zh-HK")})).toHaveAttribute("href", "/zh/refund-policy");
  });

  it("declares Ticket.refundPolicy as non-empty copy in both bundles", () => {
    for (const [locale, bundle] of bundles) {
      const value = bundle.Ticket.refundPolicy;
      expect(value, locale).toBeTypeOf("string");
      expect(String(value).trim(), locale).not.toBe("");
    }
  });
});
