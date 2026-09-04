import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({listPublic: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
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
    // The quick tabs are real <button> elements in a GET form (donor `.event-quick-tabs button`
    // grammar, app/styles/wisetech.css:815), not styled anchors -- so the selected control is
    // `aria-pressed`, and the status value travels as a form field, not a second href.
    // React's SSR for <button> always flushes the `name` attribute after `value` regardless of
    // JSX prop order (react-dom-server-legacy's `case "button"` captures `name` separately and
    // emits it via `pushFormActionAttribute` at the end) -- so the match below follows that real
    // attribute order rather than the JSX declaration order.
    expect(rendered).toContain('aria-pressed="true"');
    expect(rendered).toMatch(/<button[^>]*value="open"[^>]*name="status"/);
    expect(rendered).toMatch(/<button[^>]*value="past"[^>]*name="status"/);
    // The activity strip still links straight to the open filter.
    expect(rendered).toContain('href="/events?status=open"');
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

  it("clamps list-card descriptions, breaks long tokens, and preserves the meaningful text", async () => {
    const longDescription = "A".repeat(240);
    events.listPublic.mockResolvedValue([{
      id: "10000000-0000-4000-8000-000000000001",
      slug: "long-description",
      title: "Long description Event",
      description: longDescription,
      startsAt: "2030-01-01T10:00:00.000Z",
      endsAt: null,
      venue: "Hong Kong",
      capacity: null,
      hero: null,
    }]);

    const rendered = await renderEventsPage("open");

    expect(rendered).toContain(`class="line-clamp-3 break-words">${longDescription}</p>`);
  });
});
