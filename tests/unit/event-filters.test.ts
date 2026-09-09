import {describe, expect, it} from "vitest";

import {eventFilterQuery, hongKongMonthBounds, parseEventFilters} from "@/lib/events/filters";

describe("event filters (programme B-6)", () => {
  it("parses format, month, organiser and tag and ignores junk", () => {
    expect(parseEventFilters({format: "online", month: "2026-10", organiser: "acme", tag: "AI"})).toEqual({format: "online", month: "2026-10", organiser: "acme", tag: "ai"});
    expect(parseEventFilters({format: "tv", month: "2026-13", organiser: "../x", tag: "a".repeat(80)})).toEqual({format: null, month: null, organiser: null, tag: null});
    expect(parseEventFilters({})).toEqual({format: null, month: null, organiser: null, tag: null});
  });

  it("takes the first value of a repeated key and rejects an over-long organiser", () => {
    expect(parseEventFilters({format: ["hybrid", "online"], tag: ["fintech"]})).toMatchObject({format: "hybrid", tag: "fintech"});
    expect(parseEventFilters({organiser: "a".repeat(97)}).organiser).toBeNull();
    expect(parseEventFilters({organiser: "Acme-Robotics"}).organiser).toBe("acme-robotics");
  });

  it("round-trips to a query string without empty keys", () => {
    expect(eventFilterQuery({format: "hybrid", month: null, organiser: null, tag: "ai"}, "past")).toBe("status=past&format=hybrid&tag=ai");
    expect(eventFilterQuery({format: null, month: null, organiser: null, tag: null}, "open")).toBe("status=open");
  });

  it("bounds a month in Asia/Hong_Kong", () => {
    expect(hongKongMonthBounds("2026-10")).toEqual({start: new Date("2026-09-30T16:00:00.000Z"), end: new Date("2026-10-31T16:00:00.000Z")});
    expect(hongKongMonthBounds("2026-12")).toEqual({start: new Date("2026-11-30T16:00:00.000Z"), end: new Date("2026-12-31T16:00:00.000Z")});
  });
});
