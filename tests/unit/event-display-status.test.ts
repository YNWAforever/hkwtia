import {describe, expect, it} from "vitest";

import {deriveEventDisplayStatus} from "@/lib/events/status";

const base = {
  startsAt: new Date("2026-10-03T02:00:00.000Z"),
  endsAt: new Date("2026-10-03T06:00:00.000Z"),
  cancelled: false,
  capacity: 10,
  confirmedSeats: 4,
  waitlistAvailable: true,
} as const;

describe("event lifecycle and registration display", () => {
  it("calls the October 3 event upcoming on September 26 in Hong Kong", () => {
    expect(deriveEventDisplayStatus(base, new Date("2026-09-26T04:00:00.000Z"))).toEqual({lifecycle: "upcoming", registration: "open"});
  });

  it("moves from ongoing at the start to ended just after the inclusive end boundary", () => {
    expect(deriveEventDisplayStatus(base, base.startsAt).lifecycle).toBe("ongoing");
    expect(deriveEventDisplayStatus(base, new Date(base.endsAt.getTime() + 1))).toEqual({lifecycle: "ended", registration: "closed"});
  });

  it("keeps cancellation terminal even when the date is in the future", () => {
    expect(deriveEventDisplayStatus({...base, cancelled: true}, new Date("2026-09-26T04:00:00.000Z"))).toEqual({lifecycle: "cancelled", registration: "closed"});
  });

  it("distinguishes full from waitlist without confusing either with lifecycle", () => {
    const asOf = new Date("2026-09-26T04:00:00.000Z");
    expect(deriveEventDisplayStatus({...base, confirmedSeats: 10, waitlistAvailable: false}, asOf)).toEqual({lifecycle: "upcoming", registration: "full"});
    expect(deriveEventDisplayStatus({...base, confirmedSeats: 10}, asOf)).toEqual({lifecycle: "upcoming", registration: "waitlist"});
  });

  it("does not call capacity-constrained registration open when occupancy was not loaded", () => {
    expect(deriveEventDisplayStatus({...base, confirmedSeats: null}, new Date("2026-09-26T04:00:00.000Z"))).toEqual({lifecycle: "upcoming", registration: null});
  });
});
