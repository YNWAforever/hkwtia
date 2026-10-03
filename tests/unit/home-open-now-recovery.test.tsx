import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ listPublic: vi.fn() }));
vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: { listPublic: state.listPublic },
}));
vi.mock("@/lib/home/copy-preview", () => ({
  getHomeTranslations: async () => (key: string) =>
    (
      ({
        title: "Community opportunities",
        intro: "Public calendar",
        statusLabel: "Calendar status",
        "empty.title": "No published events",
        "empty.copy": "Check again later",
        "unavailable.title": "Events temporarily unavailable",
        "unavailable.copy": "Please retry shortly",
        updatesAction: "Get updates",
        challengeAction: "Contact the team",
      }) as Record<string, string>
    )[key] ?? key,
}));
import { OpenNow } from "@/components/home/open-now";
describe("public opening section read states", () => {
  beforeEach(() => {
    state.listPublic.mockReset();
  });
  it("shows recoverable read failure rather than claiming there are no events", async () => {
    state.listPublic.mockRejectedValue(new Error("SYNTHETIC_READ_FAILURE"));
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        {await OpenNow({ locale: "en" })}
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Events temporarily unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No published events" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact the team" }),
    ).toBeVisible();
  });
  it("reserves the honest empty state for a successful zero-row read", async () => {
    state.listPublic.mockResolvedValue([]);
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        {await OpenNow({ locale: "en" })}
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "No published events" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Events temporarily unavailable" }),
    ).not.toBeInTheDocument();
  });
});
