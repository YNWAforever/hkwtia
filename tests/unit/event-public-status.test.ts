import {describe, expect, it} from "vitest";

import {eventBoundary, parsePublicEventStatus} from "@/lib/events/public";

describe("public Event status", () => {
  it.each([
    [undefined, "open"],
    ["", "open"],
    ["future", "open"],
    [["past", "open"], "open"],
    ["past", "past"],
  ] as const)("parses %o as %s", (input, expected) => {
    expect(parsePublicEventStatus(input)).toBe(expected);
  });

  it("uses the end time when present and otherwise the start time as the Event boundary", () => {
    const startsAt = new Date("2030-01-01T09:00:00.000Z");
    const endsAt = new Date("2030-01-01T11:00:00.000Z");

    expect(eventBoundary({startsAt, endsAt})).toBe(endsAt);
    expect(eventBoundary({startsAt, endsAt: null})).toBe(startsAt);
  });
});
