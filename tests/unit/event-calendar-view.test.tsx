import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {EventCalendarView} from "@/components/marketing/event-calendar-view";

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
});
