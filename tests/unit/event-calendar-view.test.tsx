import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {EventCalendarView} from "@/components/marketing/event-calendar-view";
import {formatEventDate} from "@/lib/home/format-event-date";

const events = [
  {id: "1", slug: "morning-clinic", title: "Morning Clinic", description: "d1", startsAt: "2030-10-24T01:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: null, hero: null},
  {id: "2", slug: "afternoon-demo", title: "Afternoon Demo", description: "d2", startsAt: "2030-10-24T08:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null},
  {id: "3", slug: "next-day-talk", title: "Next Day Talk", description: "d3", startsAt: "2030-10-25T01:00:00.000Z", endsAt: null, venue: "Central", capacity: 20, hero: null},
];

describe("EventCalendarView", () => {
  it("groups events under one day header per Hong Kong calendar day, in chronological order", () => {
    render(<EventCalendarView events={events} locale="en" />);

    const dayGroups = document.querySelectorAll(".event-calendar-view");
    expect(dayGroups).toHaveLength(2);
    expect(within(dayGroups[0] as HTMLElement).getByRole("link", {name: /Morning Clinic/})).toHaveAttribute("href", "/events/morning-clinic");
    expect(within(dayGroups[0] as HTMLElement).getByRole("link", {name: /Afternoon Demo/})).toHaveAttribute("href", "/events/afternoon-demo");
    expect(within(dayGroups[1] as HTMLElement).getByRole("link", {name: /Next Day Talk/})).toHaveAttribute("href", "/events/next-day-talk");
  });

  it("omits the venue span when an event has no venue", () => {
    render(<EventCalendarView events={[events[1]]} locale="en" />);

    expect(screen.queryByText("Kwun Tong")).not.toBeInTheDocument();
  });

  it("sorts defensively by startsAt so day groups and within-day events come out chronological even when the input arrives shuffled", () => {
    // Deliberately out of chronological order, and NOT sorted by any other field either (e.g. not
    // by endsAt) -- groupByDay must not rely on a pre-sorted caller contract.
    const shuffled = [
      {id: "3", slug: "next-day-talk", title: "Next Day Talk", description: "d3", startsAt: "2030-10-25T01:00:00.000Z", endsAt: null, venue: "Central", capacity: 20, hero: null},
      {id: "2", slug: "afternoon-demo", title: "Afternoon Demo", description: "d2", startsAt: "2030-10-24T08:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null},
      {id: "1", slug: "morning-clinic", title: "Morning Clinic", description: "d1", startsAt: "2030-10-24T01:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: null, hero: null},
    ];

    render(<EventCalendarView events={shuffled} locale="en" />);

    const dayGroups = document.querySelectorAll(".event-calendar-view");
    expect(dayGroups).toHaveLength(2);
    // Day groups themselves are chronological: 2030-10-24 before 2030-10-25.
    const firstDayLinks = within(dayGroups[0] as HTMLElement).getAllByRole("link");
    const secondDayLinks = within(dayGroups[1] as HTMLElement).getAllByRole("link");
    expect(firstDayLinks).toHaveLength(2);
    expect(secondDayLinks).toHaveLength(1);
    expect(secondDayLinks[0]).toHaveTextContent("Next Day Talk");
    // Within the first day, events are ordered by startsAt ascending: Morning Clinic (01:00)
    // before Afternoon Demo (08:00), even though the input listed Afternoon Demo first.
    expect(firstDayLinks[0]).toHaveTextContent("Morning Clinic");
    expect(firstDayLinks[1]).toHaveTextContent("Afternoon Demo");
  });

  it("gives each event's bare day-of-month <time> an aria-label with the full formatted date, matching the sibling EventCard pattern", () => {
    render(<EventCalendarView events={events} locale="en" />);

    const expectedFullDate = formatEventDate(events[0].startsAt, "en");
    const time = screen.getByRole("link", {name: /Morning Clinic/}).querySelector("time")!;
    expect(time).toHaveAttribute("aria-label", expectedFullDate);
    // The label is the full date, not just the bare day-of-month number rendered as its text.
    expect(time.textContent).not.toBe(expectedFullDate);
  });
});
