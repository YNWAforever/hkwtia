import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {EventCard} from "@/components/marketing/event-card";

const labels = {status: {open: "Open", past: "Past"}, venueLabel: "Venue", capacityLabel: "Capacity", cta: "View event"};

describe("EventCard", () => {
  it("renders the open-status pill, date block, venue, capacity and two links for an open event", () => {
    render(
      <EventCard
        event={{id: "1", slug: "ai-clinic", title: "AI Clinic", description: "A hands-on clinic.", startsAt: "2030-10-24T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null}}
        status="open"
        locale="en"
        labels={labels}
      />,
    );

    const card = screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")!;
    expect(card).toHaveClass("event-card-v2");
    expect(within(card).getByText("Open")).toHaveClass("event-status");
    expect(within(card).getByText("Open")).not.toHaveClass("completed");
    expect(within(card).getByText("Kwun Tong")).toBeInTheDocument();
    expect(within(card).getByText("40")).toBeInTheDocument();
    expect(within(card).getAllByRole("link")).toHaveLength(2);
    expect(within(card).getByRole("link", {name: "AI Clinic"})).toHaveAttribute("href", "/events/ai-clinic");
    expect(within(card).getByRole("link", {name: "View event"})).toHaveAttribute("href", "/events/ai-clinic");
  });

  it("renders the past-status pill and omits venue/capacity facts that are null, keeping the description clamped", () => {
    const longDescription = "B".repeat(240);
    render(
      <EventCard
        event={{id: "2", slug: "demo-day", title: "Demo Day", description: longDescription, startsAt: "2020-01-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null}}
        status="past"
        locale="en"
        labels={labels}
      />,
    );

    const pastPill = screen.getByText("Past");
    expect(pastPill).toHaveClass("event-status", "completed");
    expect(screen.queryByText("Venue")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.getByText(longDescription)).toHaveClass("line-clamp-3", "break-words");
  });
});
