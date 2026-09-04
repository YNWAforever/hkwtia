import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
} as const;

function messageAt(namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles.en);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => (key: string) => String(messageAt(namespace, key))),
  setRequestLocale: () => undefined,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import EventsPage from "@/app/[locale]/(public)/events/page";

async function renderEventsPage(): Promise<void> {
  render(await EventsPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
}

describe("Events page donor markup", () => {
  it("renders the hero, activity strip, an EventCard grid and the recommendations/interest/closing bands", async () => {
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.Events.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Common.breadcrumbHome})).toHaveAttribute("href", "/");

    const strip = screen.getByRole("navigation", {name: bundles.en.Events.activityStrip.label});
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.launchpadLabel})).toHaveAttribute("href", "/launchpad");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.showcaseLabel})).toHaveAttribute("href", "/showcase");
    expect(within(strip).getByRole("link", {name: bundles.en.Events.activityStrip.openLabel})).toHaveAttribute("href", "/events?status=open");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")).toHaveClass("event-card-v2");

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.launchpad.title}).closest("a")).toHaveAttribute("href", "/launchpad");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.showcase.title}).closest("a")).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.recommendations.items.membership.title}).closest("a")).toHaveAttribute("href", "/membership");

    expect(screen.getByRole("link", {name: bundles.en.Events.interest.action})).toHaveAttribute("href", "/events?status=open");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.primary})).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", {name: bundles.en.Events.closing.actions.secondary})).toHaveAttribute("href", "/membership");
  });

  it("renders the honest-empty state with a contact action when no open event exists", async () => {
    listPublic.mockResolvedValueOnce([]);
    await renderEventsPage();

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Events.empty.open.title})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Events.empty.action})).toHaveAttribute("href", "/contact");
  });
});
