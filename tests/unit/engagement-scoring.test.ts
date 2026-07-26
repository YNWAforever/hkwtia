import {describe, expect, it} from "vitest";

import {
  decayedScore,
  scoreEngagement,
  type EngagementPoint,
} from "@/lib/engagement/scoring";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const asOf = new Date("2027-01-15T18:00:00.000Z");

function fixture(points: readonly Readonly<{points: number; weeksAgo: number}>[]) {
  return scoreEngagement(points.map((point) => ({
    points: point.points,
    occurredAt: new Date(asOf.getTime() - point.weeksAgo * WEEK_MS),
  })), asOf);
}

describe("engagement scoring", () => {
  it.each([
    {points: [], score: 0, trend: 0},
    {points: [{points: 50, weeksAgo: 0}], score: 50, trend: 50},
    {points: [{points: 1000, weeksAgo: 0}], score: 100, trend: 100},
    // The current score excludes this 182-day-old event, while the independently
    // evaluated prior score sees it at 154 days old.
    {points: [{points: 10, weeksAgo: 26}], score: 0, trend: -5.12},
  ])("calculates score $score and trend $trend from $points", ({points, score, trend}) => {
    expect(fixture(points)).toEqual({score, trend});
  });

  it("uses exact fractional weeks and returns fixed two-decimal values", () => {
    expect(fixture([{points: 100, weeksAgo: 0.5}])).toEqual({
      score: 98.49,
      trend: 98.49,
    });
  });

  it("includes the exact 180-day boundary and excludes the next millisecond", () => {
    const boundary: EngagementPoint = {
      points: 100,
      occurredAt: new Date(asOf.getTime() - 180 * DAY_MS),
    };
    const outside: EngagementPoint = {
      points: 100,
      occurredAt: new Date(asOf.getTime() - 180 * DAY_MS - 1),
    };

    expect(decayedScore([boundary], asOf)).toBe(45.69);
    expect(decayedScore([outside], asOf)).toBe(0);
  });

  it("excludes events after each evaluation instant", () => {
    const event = {
      points: 50,
      occurredAt: new Date(asOf.getTime() - 28 * DAY_MS),
    };
    const future = {
      points: 100,
      occurredAt: new Date(asOf.getTime() + 1),
    };

    expect(scoreEngagement([event, future], asOf)).toEqual({
      score: 44.26,
      trend: -5.74,
    });
  });

  it("independently applies the prior instant's rolling 180-day window", () => {
    expect(scoreEngagement([{
      points: 100,
      occurredAt: new Date(asOf.getTime() - 181 * DAY_MS),
    }], asOf)).toEqual({
      score: 0,
      trend: -51.39,
    });
  });

  it("clamps negative and oversized totals to the inclusive score range", () => {
    expect(scoreEngagement([{points: -20, occurredAt: asOf}], asOf)).toEqual({
      score: 0,
      trend: 0,
    });
    expect(scoreEngagement([{points: 1_000, occurredAt: asOf}], asOf)).toEqual({
      score: 100,
      trend: 100,
    });
  });

  it("rejects invalid evaluation dates and point values with non-sensitive codes", () => {
    expect(() => scoreEngagement([], new Date(Number.NaN)))
      .toThrow("INVALID_ENGAGEMENT_AS_OF");
    expect(() => scoreEngagement([{
      points: Number.POSITIVE_INFINITY,
      occurredAt: asOf,
    }], asOf)).toThrow("INVALID_ENGAGEMENT_POINT");
    expect(() => scoreEngagement([{
      points: 10,
      occurredAt: new Date(Number.NaN),
    }], asOf)).toThrow("INVALID_ENGAGEMENT_POINT");
  });
});
