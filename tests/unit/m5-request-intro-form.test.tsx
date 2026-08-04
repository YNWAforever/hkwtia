import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {RequestIntroForm} from "@/components/marketing/request-intro-form";

describe("request-intro form", () => {
  it("renders accessible contact fields and a visually hidden honeypot", () => {
    render(<RequestIntroForm
      action={vi.fn(async () => ({ok: true as const}))}
      locale="en"
      slug="harbour-vision-ai"
      labels={{
        name: "Name", email: "Email", organization: "Organisation", message: "Message", website: "Website",
        submit: "Request an introduction", submitting: "Sending", success: "Received",
        invalid: "Check your details", rateLimited: "Try again later",
      }}
    />);

    expect(screen.getByLabelText("Name")).toHaveAttribute("name", "contactName");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Organisation")).toHaveAttribute("name", "organization");
    expect(screen.getByLabelText("Message")).toHaveAttribute("name", "message");
    expect(screen.getByLabelText("Website").parentElement).toHaveClass("sr-only");
    expect(screen.getByRole("button", {name: "Request an introduction"})).toBeEnabled();
  });
});
