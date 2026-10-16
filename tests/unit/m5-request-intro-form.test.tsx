import {fireEvent, render, screen, waitFor} from "@testing-library/react";
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
  it("reuses one idempotency key across retries and rotates after success", async () => {
    const action = vi.fn()
      .mockResolvedValueOnce({ok: false as const, code: "invalid" as const})
      .mockResolvedValue({ok: true as const});
    render(<RequestIntroForm
      action={action}
      locale="en"
      slug="harbour-vision-ai"
      labels={{
        name: "Name", email: "Email", organization: "Organisation", message: "Message", website: "Website",
        submit: "Request an introduction", submitting: "Sending", success: "Received",
        invalid: "Check your details", rateLimited: "Try again later",
      }}
    />);
    const form = screen.getByRole("button", {name: "Request an introduction"}).closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    await screen.findByText("Check your details");
    const first = action.mock.calls[0]?.[0]?.get("idempotencyKey");
    expect(first).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));

    fireEvent.submit(form!);
    await screen.findByText("Received");
    expect(action.mock.calls[1]?.[0]?.get("idempotencyKey")).toBe(first);

    fireEvent.submit(form!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(action.mock.calls[2]?.[0]?.get("idempotencyKey")).not.toBe(first);
  });
  it("deduplicates a second submit queued while the first result is pending", async () => {
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let sends = 0;
    const action = vi.fn(async (formData: FormData) => {
      expect(formData.get("idempotencyKey")).toEqual(expect.any(String));
      sends += 1;
      if (sends === 1) await first;
      return {ok: true as const};
    });
    render(<RequestIntroForm
      action={action}
      locale="en"
      slug="harbour-vision-ai"
      labels={{
        name: "Name", email: "Email", organization: "Organisation", message: "Message", website: "Website",
        submit: "Request an introduction", submitting: "Sending", success: "Received",
        invalid: "Check your details", rateLimited: "Try again later",
      }}
    />);
    const form = screen.getByRole("button", {name: "Request an introduction"}).closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const firstKey = action.mock.calls[0]?.[0]?.get("idempotencyKey");
    expect(firstKey).toEqual(expect.any(String));
    expect(action.mock.calls[1]?.[0]?.get("idempotencyKey")).toBe(firstKey);
  });
});
