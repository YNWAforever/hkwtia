import {describe, expect, it} from "vitest";

import {scoreEngagement} from "@/lib/engagement/scoring";

const DAY_MS = 86_400_000;

describe("engagement trend precision", () => {
  it("subtracts exact decayed scores before fixing the stored trend to two decimals", () => {
    const asOf = new Date("2027-01-15T18:00:00.000Z");

    expect(scoreEngagement([
      {points: 1, occurredAt: new Date(asOf.getTime() - 29 * DAY_MS)},
      {points: 1, occurredAt: asOf},
    ], asOf)).toEqual({
      score: 1.88,
      trend: 0.89,
    });
  });
});
