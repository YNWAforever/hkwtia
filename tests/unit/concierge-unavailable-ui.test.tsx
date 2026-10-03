import {fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import en from "@/messages/en.json";

const labels = {
  ...localizeConcierge((key) => en.Concierge[key]),
  configurationUnavailable: "AI support is temporarily unavailable. You can still apply for membership or contact WTIA.",
  temporarilyUnavailable: "WTIA Concierge is temporarily unavailable. Please try again later or contact WTIA.",
  rateLimited: "Too many requests. Please wait before trying again.",
  timeout: "WTIA Concierge took too long to respond. Please try again later.",
  applicationGuide: "Apply for membership",
  contactSupport: "Contact WTIA",
};
const requestId = "33333333-3333-4333-8333-333333333333";

afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});

async function send() {
  fireEvent.click(screen.getByRole("button", {name: labels.launcher}));
  await screen.findByRole("dialog", {name: labels.title});
  fireEvent.change(screen.getByRole("textbox", {name: labels.messageLabel}), {
    target: {value: "Synthetic membership question"},
  });
  fireEvent.click(screen.getByRole("button", {name: labels.send}));
  return screen.findByRole("alert");
}

describe("Concierge HTTP failure recovery", () => {
  it.each(["AI_CONFIGURATION_UNAVAILABLE", "AI_DISABLED"])("%s preserves the question and offers manual localized journeys without a fake handoff", async (error) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({error, requestId}, {status: 503}));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConciergeWidget locale="zh-HK" labels={labels} />);
    expect(await send()).toHaveTextContent(error === "AI_DISABLED" ? labels.disabled : labels.configurationUnavailable);
    expect(screen.getByText("Synthetic membership question")).toBeVisible();
    expect(screen.getByRole("link", {name: labels.applicationGuide})).toHaveAttribute("href", "/zh/join");
    expect(screen.getByRole("link", {name: labels.contactSupport})).toHaveAttribute("href", "/zh/contact");
    expect(screen.getByText(`Reference: ${requestId}`)).toBeVisible();
    expect(screen.queryByText(labels.leaveMessage)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: labels.retry})).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    [429, "RATE_LIMITED", labels.rateLimited],
    [503, "AI_TEMPORARILY_UNAVAILABLE", labels.temporarilyUnavailable],
    [504, "AI_TIMEOUT", labels.timeout],
  ])("HTTP %s is distinct from a network failure", async (status, error, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({error, requestId}, {status: Number(status)})));
    render(<ConciergeWidget locale="en" labels={labels} />);
    expect(await send()).toHaveTextContent(String(expected));
    expect(screen.getByRole("button", {name: labels.retry})).toBeVisible();
  });
  it("does not render an arbitrary provider message or unsafe request ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({error: "<img onerror=alert(1)>", requestId: "private-token", message: "private-provider-message"}, {status: 503})));
    render(<ConciergeWidget locale="en" labels={labels} />);
    expect(await send()).toHaveTextContent(labels.temporarilyUnavailable);
    expect(document.body.textContent).not.toMatch(/private-token|private-provider-message|onerror/);
    expect(document.querySelector("img")).toBeNull();
  });
  it("keeps a network failure distinct", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ConciergeWidget locale="en" labels={labels} />);
    expect(await send()).toHaveTextContent(labels.error);
  });
});
