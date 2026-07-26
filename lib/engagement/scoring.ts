export type EngagementPoint = Readonly<{
  points: number;
  occurredAt: Date;
}>;

export type EngagementScore = Readonly<{
  score: number;
  trend: number;
}>;

export type EngagementScoringErrorCode =
  | "INVALID_ENGAGEMENT_AS_OF"
  | "INVALID_ENGAGEMENT_POINT";

export class EngagementScoringError extends Error {
  constructor(readonly code: EngagementScoringErrorCode) {
    super(code);
    this.name = "EngagementScoringError";
  }
}

type ValidatedEngagementPoint = Readonly<{
  points: number;
  occurredAt: number;
}>;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WINDOW_MS = 180 * DAY_MS;
const TREND_OFFSET_MS = 28 * DAY_MS;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function requireEvaluationDate(asOf: Date): number {
  if (!validDate(asOf)) {
    throw new EngagementScoringError("INVALID_ENGAGEMENT_AS_OF");
  }
  return asOf.getTime();
}

function requirePoint(event: EngagementPoint): ValidatedEngagementPoint {
  if (
    !event
    || !Number.isSafeInteger(event.points)
    || !validDate(event.occurredAt)
  ) {
    throw new EngagementScoringError("INVALID_ENGAGEMENT_POINT");
  }
  return {points: event.points, occurredAt: event.occurredAt.getTime()};
}

function fixedTwoDecimals(value: number): number {
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function exactDecayedScore(
  points: readonly ValidatedEngagementPoint[],
  asOfMs: number,
): number {
  const windowStart = asOfMs - WINDOW_MS;
  const total = points.reduce((sum, event) => {
    if (event.occurredAt < windowStart || event.occurredAt > asOfMs) {
      return sum;
    }
    const weeksAgo = (asOfMs - event.occurredAt) / WEEK_MS;
    return sum + event.points * 0.97 ** weeksAgo;
  }, 0);
  return Math.min(100, Math.max(0, total));
}

export function decayedScore(
  events: readonly EngagementPoint[],
  asOf: Date,
): number {
  const asOfMs = requireEvaluationDate(asOf);
  return fixedTwoDecimals(exactDecayedScore(events.map(requirePoint), asOfMs));
}

export function scoreEngagement(
  events: readonly EngagementPoint[],
  asOf: Date,
): EngagementScore {
  const asOfMs = requireEvaluationDate(asOf);
  const priorAsOfMs = requireEvaluationDate(
    new Date(asOfMs - TREND_OFFSET_MS),
  );
  const points = events.map(requirePoint);
  const exactScore = exactDecayedScore(points, asOfMs);
  const exactPriorScore = exactDecayedScore(points, priorAsOfMs);
  return {
    score: fixedTwoDecimals(exactScore),
    trend: fixedTwoDecimals(exactScore - exactPriorScore),
  };
}
