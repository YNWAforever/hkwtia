import {describe, expect, it} from "vitest";

import {canTransitionEvent, derivedEventFlags, hongKongQuarterBounds} from "@/lib/events/status";

describe("event status helpers (programme B-1, D-12)", () => {
  it("derives the legacy booleans from the enums", () => {
    expect(derivedEventFlags({status: "published", visibility: "public"})).toEqual({published: true, memberOnly: false});
    expect(derivedEventFlags({status: "published", visibility: "members_only"})).toEqual({published: true, memberOnly: true});
    expect(derivedEventFlags({status: "pending_review", visibility: "public"})).toEqual({published: false, memberOnly: false});
    expect(derivedEventFlags({status: "published", visibility: "invite_only"})).toEqual({published: true, memberOnly: true});
  });

  it("allows only the review-loop transitions", () => {
    expect(canTransitionEvent("draft", "pending_review")).toBe(true);
    expect(canTransitionEvent("pending_review", "published")).toBe(true);
    expect(canTransitionEvent("pending_review", "rejected")).toBe(true);
    expect(canTransitionEvent("rejected", "pending_review")).toBe(true);
    expect(canTransitionEvent("published", "cancelled")).toBe(true);
    expect(canTransitionEvent("draft", "published")).toBe(false);
    expect(canTransitionEvent("cancelled", "published")).toBe(false);
  });

  it("computes calendar-quarter bounds in Hong Kong time", () => {
    const bounds = hongKongQuarterBounds(new Date("2026-09-09T20:00:00.000Z"));
    expect(bounds.start.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("rolls a late-UTC instant into the next Hong Kong quarter", () => {
    // 2026-09-30T20:00Z is already 2026-10-01 04:00 in Hong Kong, so Q4.
    const bounds = hongKongQuarterBounds(new Date("2026-09-30T20:00:00.000Z"));
    expect(bounds.start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});
