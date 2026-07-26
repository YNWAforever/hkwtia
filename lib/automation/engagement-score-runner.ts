import "server-only";

import type {
  AutomationCronActor,
  AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  engagementScoreRepository,
  type EngagementScoreEvent,
  type EngagementScoreRepository,
} from "@/lib/db/repos/engagement";
import {
  EngagementScoringError,
  scoreEngagement,
} from "@/lib/engagement/scoring";

const DAY_MS = 86_400_000;
const SCORE_INPUT_WINDOW_MS = 208 * DAY_MS;
const DEFAULT_BATCH_SIZE = 100;

export type EngagementScoreJobErrorCode =
  | "ENGAGEMENT_SCORE_BATCH_FAILED"
  | "ENGAGEMENT_SCORE_UPSERT_FAILED"
  | "INVALID_ENGAGEMENT_POINT";

export type EngagementScoreJobSummary = Readonly<{
  scanned: number;
  upserted: number;
  skipped: number;
  errors: Readonly<Partial<Record<EngagementScoreJobErrorCode, number>>>;
}>;

export type EngagementScoreRunnerDependencies = Readonly<{
  engagement: EngagementScoreRepository;
  batchSize: number;
}>;

type MutableSummary = {
  scanned: number;
  upserted: number;
  skipped: number;
  errors: Partial<Record<EngagementScoreJobErrorCode, number>>;
};

const defaultDependencies: EngagementScoreRunnerDependencies = {
  engagement: engagementScoreRepository,
  batchSize: DEFAULT_BATCH_SIZE,
};

function requireCronActor(
  actor: AutomationRepositoryActor,
): asserts actor is AutomationCronActor {
  if (actor.kind !== "system" || actor.source !== "automation-cron") {
    throw new Error("FORBIDDEN");
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function recordError(
  summary: MutableSummary,
  code: EngagementScoreJobErrorCode,
): void {
  summary.errors[code] = (summary.errors[code] ?? 0) + 1;
}

function scoringErrorCode(error: unknown): EngagementScoreJobErrorCode {
  return error instanceof EngagementScoringError
    && error.code === "INVALID_ENGAGEMENT_POINT"
    ? error.code
    : "INVALID_ENGAGEMENT_POINT";
}

export async function recomputeEngagementScores(
  actor: AutomationRepositoryActor,
  asOf: Date,
  dependencies: EngagementScoreRunnerDependencies = defaultDependencies,
): Promise<EngagementScoreJobSummary> {
  requireCronActor(actor);
  if (!validDate(asOf)) throw new Error("INVALID_ENGAGEMENT_AS_OF");
  if (
    !Number.isSafeInteger(dependencies.batchSize)
    || dependencies.batchSize <= 0
    || dependencies.batchSize > 1_000
  ) {
    throw new Error("INVALID_ENGAGEMENT_SCORE_BATCH_SIZE");
  }

  const summary: MutableSummary = {
    scanned: 0,
    upserted: 0,
    skipped: 0,
    errors: {},
  };
  const windowStart = new Date(asOf.getTime() - SCORE_INPUT_WINDOW_MS);
  let afterProfileId: string | null = null;

  while (true) {
    let batch;
    try {
      batch = await dependencies.engagement.listScoreBatch(actor, {
        afterProfileId,
        asOf,
        limit: dependencies.batchSize,
        windowStart,
      });
    } catch {
      recordError(summary, "ENGAGEMENT_SCORE_BATCH_FAILED");
      break;
    }
    if (batch.profileIds.length === 0) break;

    const profileEvents = new Map<string, EngagementScoreEvent[]>(
      batch.profileIds.map((profileId) => [profileId, []]),
    );
    let invalidBatch = false;
    for (const event of batch.events) {
      const events = profileEvents.get(event.profileId);
      if (!events) {
        invalidBatch = true;
        break;
      }
      events.push(event);
    }
    const nextProfileId = batch.profileIds.at(-1);
    if (
      invalidBatch
      || !nextProfileId
      || nextProfileId === afterProfileId
      || batch.profileIds.length > dependencies.batchSize
    ) {
      recordError(summary, "ENGAGEMENT_SCORE_BATCH_FAILED");
      break;
    }

    for (const profileId of batch.profileIds) {
      summary.scanned += 1;
      let score;
      try {
        score = scoreEngagement(profileEvents.get(profileId) ?? [], asOf);
      } catch (error) {
        summary.skipped += 1;
        recordError(summary, scoringErrorCode(error));
        continue;
      }
      try {
        await dependencies.engagement.upsertScore(actor, {
          profileId,
          ...score,
          computedAt: asOf,
        });
        summary.upserted += 1;
      } catch {
        summary.skipped += 1;
        recordError(summary, "ENGAGEMENT_SCORE_UPSERT_FAILED");
      }
    }

    afterProfileId = nextProfileId;
    if (batch.profileIds.length < dependencies.batchSize) break;
  }

  return summary;
}
