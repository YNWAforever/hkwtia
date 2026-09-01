import {renderToStaticMarkup} from "react-dom/server";
import type {ComponentProps} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/image", () => ({
  default: ({unoptimized, ...props}: ComponentProps<"img"> & {unoptimized?: boolean}) => <img {...props} data-unoptimized={String(unoptimized)}/>,
}));

import {EventDetail} from "@/components/marketing/event-detail";

describe("private Event hero rendering", () => {
  it("bypasses the image optimizer for an own-origin private media hero", () => {
    const rendered = renderToStaticMarkup(<EventDetail
      event={{
        id: "10000000-0000-4000-8000-000000000001",
        slug: "private-hero",
        title: "Private hero Event",
        description: "Curated Event description.",
        startsAt: "2030-01-01T09:00:00.000Z",
        endsAt: null,
        venue: "Hong Kong",
        capacity: 12,
        hero: {url: "/api/media/10000000-0000-4000-8000-000000000001", alt: "Curated Event hero"},
      }}
      labels={{date: "Date", venue: "Venue", capacity: "Capacity"}}
      locale="en"
    />);

    expect(rendered).toContain('/api/media/10000000-0000-4000-8000-000000000001');
    expect(rendered).toContain('data-unoptimized="true"');
    expect(rendered).not.toContain("https://donor.example");
  });
});
