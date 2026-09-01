import {render, screen} from "@testing-library/react";
import {createElement} from "react";
import {describe, expect, it} from "vitest";

import {EventDetail} from "@/components/marketing/event-detail";

describe("detail views", () => {
  it("renders a display-safe public Event projection with one heading and date", () => {
    render(createElement(EventDetail, {locale: "en", labels: {date: "Date", venue: "Venue", capacity: "Capacity"}, event: {id: "event-id", slug: "demo-day", title: "Demo Day", description: "A public Event.", startsAt: "2026-08-01T02:00:00.000Z", endsAt: null, venue: "WTIA", capacity: null, hero: null}}));
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
