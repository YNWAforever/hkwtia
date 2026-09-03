import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listFeaturedPublic = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listFeaturedPublic}}));

describe("EventsJourney", () => {
  it("always renders the 3-stage Before/During/After grid", async () => {
    listFeaturedPublic.mockResolvedValueOnce([]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    const grid = document.querySelector(".event-stage-grid") as HTMLElement;
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.before.title)).toBeInTheDocument();
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.during.title)).toBeInTheDocument();
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.after.title)).toBeInTheDocument();
  });

  it("renders the .event-empty CTA to /events when no featured event exists", async () => {
    listFeaturedPublic.mockResolvedValueOnce([]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.eventsJourney.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.eventsJourney.viewAllAction})).toHaveAttribute("href", "/events");
  });

  it("renders up to 2 featured events as cards when available, and calls the repository with limit 2", async () => {
    listFeaturedPublic.mockResolvedValueOnce([
      {id: "1", slug: "demo-day", title: "Demo Day", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    expect(screen.queryByText(bundles.en.Home.eventsJourney.emptyTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Demo Day/})).toHaveAttribute("href", "/events/demo-day");
    expect(listFeaturedPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({limit: 2, locale: "en"}),
    );
  });
});
