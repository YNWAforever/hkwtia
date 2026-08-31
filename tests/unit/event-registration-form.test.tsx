import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({Link: ({children, href}: {children: React.ReactNode; href: string}) => <a href={href}>{children}</a>}));

import {EventRegistrationForm} from "@/components/portal/event-registration-form";

const messages = {
  registered: "Registered.",
  waitlist: "Added to waitlist.",
  alreadyRegistered: "Already registered.",
  alreadyWaitlisted: "Already waitlisted.",
  unauthenticated: "Sign in to register.",
  ineligible: "Membership required.",
  closed: "Registration closed.",
  error: "Unable to register.",
};

describe("public Event registration recovery", () => {
  it.each([
    ["unauthenticated", "Sign in to register.", "/join"],
    ["ineligible", "Membership required.", "/membership"],
  ] as const)("renders the %s recovery message once as its link", async (code, message, href) => {
    render(<EventRegistrationForm
      action={vi.fn(async () => ({code, message}))}
      eventId="10000000-0000-4000-8000-000000000001"
      links={{unauthenticated: "/join", ineligible: "/membership"}}
      messages={messages}
      pendingLabel="Registering"
      registerLabel="Register"
    />);

    fireEvent.submit(screen.getByRole("button", {name: "Register"}).closest("form")!);

    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
    expect(screen.getByRole("link", {name: message})).toHaveAttribute("href", href);
  });
});
