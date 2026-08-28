import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({listPublic: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));

import EventsPage from "@/app/[locale]/(public)/events/page";

const anonymous = {kind: "anonymous", userId: null} as const;

async function renderEventsPage(status: string | readonly string[] | undefined): Promise<string> {
  return renderToStaticMarkup(await EventsPage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve({status: status === undefined || typeof status === "string" ? status : Array.from(status)}),
  }));
}

describe("public Event status controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.listPublic.mockResolvedValue([]);
  });

  it("drives the public reader and selected control from one scalar status", async () => {
    const rendered = await renderEventsPage("past");

    expect(events.listPublic).toHaveBeenCalledWith(
      anonymous,
      expect.objectContaining({status: "past", asOf: expect.any(Date)}),
    );
    expect(rendered).toContain('aria-current="page"');
    expect(rendered).toContain('href="/events?status=open"');
    expect(rendered).toContain('href="/events?status=past"');
  });

  it.each([undefined, "", "future", ["past", "open"]] as const)("uses open for malformed status %o", async (status) => {
    await renderEventsPage(status);

    expect(events.listPublic).toHaveBeenCalledWith(
      anonymous,
      expect.objectContaining({status: "open", asOf: expect.any(Date)}),
    );
  });

  it("renders an unavailable state when the repository read fails", async () => {
    events.listPublic.mockRejectedValue(new Error("database private payload"));

    await expect(renderEventsPage(undefined)).resolves.toContain("unavailableTitle");
  });
});
