import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  recomputeEngagementScores,
  type EngagementScoreRunnerDependencies,
} from "@/lib/automation/engagement-score-runner";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createEngagementScoreRepository,
  type EngagementScoreBatch,
  type EngagementScoreRepository,
} from "@/lib/db/repos/engagement";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const DAY_MS = 86_400_000;
const asOf = new Date("2027-01-15T18:00:00.000Z");
const cronActor = automationCronActor();
const dialect = new PgDialect();

function runnerDependencies(
  batches: readonly EngagementScoreBatch[],
  upsertScore = vi.fn<EngagementScoreRepository["upsertScore"]>(async () => undefined),
): EngagementScoreRunnerDependencies & {
  engagement: EngagementScoreRepository;
  upsertScore: typeof upsertScore;
} {
  const remaining = [...batches];
  const engagement: EngagementScoreRepository = {
    listScoreBatch: vi.fn(async () => remaining.shift() ?? {profileIds: [], events: []}),
    upsertScore,
  };
  return {engagement, batchSize: 2, upsertScore};
}

function sequenceDatabase(responses: unknown[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let transactions = 0;
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    commands.push(dialect.sqlToQuery(query));
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => {
      transactions += 1;
      return work({execute});
    },
  };
  return {commands, database, transactions: () => transactions};
}

describe("engagement score runner", () => {
  it("batches profile identifiers and point facts only, then deterministically upserts every profile", async () => {
    const dependencies = runnerDependencies([
      {
        profileIds: ["profile-a", "profile-b"],
        events: [
          {profileId: "profile-a", points: 50, occurredAt: asOf},
          {
            profileId: "profile-b",
            points: 50,
            occurredAt: new Date(asOf.getTime() - 28 * DAY_MS),
          },
        ],
      },
      {profileIds: ["profile-c"], events: []},
    ]);

    await expect(recomputeEngagementScores(cronActor, asOf, dependencies))
      .resolves.toEqual({
        scanned: 3,
        upserted: 3,
        skipped: 0,
        errors: {},
      });

    expect(dependencies.engagement.listScoreBatch).toHaveBeenNthCalledWith(
      1,
      cronActor,
      {
        afterProfileId: null,
        asOf,
        limit: 2,
        windowStart: new Date(asOf.getTime() - 208 * DAY_MS),
      },
    );
    expect(dependencies.engagement.listScoreBatch).toHaveBeenNthCalledWith(
      2,
      cronActor,
      expect.objectContaining({afterProfileId: "profile-b"}),
    );
    expect(dependencies.upsertScore.mock.calls.map((call) => call[1])).toEqual([
      {profileId: "profile-a", score: 50, trend: 50, computedAt: asOf},
      {profileId: "profile-b", score: 44.26, trend: -5.74, computedAt: asOf},
      {profileId: "profile-c", score: 0, trend: 0, computedAt: asOf},
    ]);
  });

  it("records sanitized per-profile validation and upsert errors while continuing", async () => {
    const upsertScore = vi.fn<EngagementScoreRepository["upsertScore"]>(
      async (_actor, input) => {
        if (input.profileId === "profile-write-failure") throw new Error("private@example.test");
      },
    );
    const dependencies = runnerDependencies([{
      profileIds: ["profile-invalid", "profile-write-failure", "profile-good"],
      events: [
        {
          profileId: "profile-invalid",
          points: Number.NaN,
          occurredAt: asOf,
        },
        {profileId: "profile-write-failure", points: 20, occurredAt: asOf},
        {profileId: "profile-good", points: 10, occurredAt: asOf},
      ],
    }], upsertScore);

    await expect(recomputeEngagementScores(cronActor, asOf, {
      ...dependencies,
      batchSize: 3,
    })).resolves.toEqual({
      scanned: 3,
      upserted: 1,
      skipped: 2,
      errors: {
        INVALID_ENGAGEMENT_POINT: 1,
        ENGAGEMENT_SCORE_UPSERT_FAILED: 1,
      },
    });
    expect(upsertScore).toHaveBeenCalledTimes(2);
  });

  it("returns a sanitized batch error without retrying forever", async () => {
    const engagement: EngagementScoreRepository = {
      listScoreBatch: vi.fn(async () => {
        throw new Error("database contained private@example.test");
      }),
      upsertScore: vi.fn(),
    };

    await expect(recomputeEngagementScores(cronActor, asOf, {
      engagement,
      batchSize: 2,
    })).resolves.toEqual({
      scanned: 0,
      upserted: 0,
      skipped: 0,
      errors: {ENGAGEMENT_SCORE_BATCH_FAILED: 1},
    });
    expect(engagement.listScoreBatch).toHaveBeenCalledOnce();
  });

  it("requires the automation-cron system actor before repository access", async () => {
    const engagement: EngagementScoreRepository = {
      listScoreBatch: vi.fn(),
      upsertScore: vi.fn(),
    };
    const actors = [
      {kind: "staff", userId: "auth-staff", profileId: "staff-1"},
      {kind: "member", userId: "auth-member", profileId: "member-1"},
      {kind: "system", userId: null, source: "stripe-webhook"},
    ] as const;

    for (const actor of actors) {
      await expect(recomputeEngagementScores(
        actor,
        asOf,
        {engagement, batchSize: 2},
      )).rejects.toThrow("FORBIDDEN");
    }
    expect(engagement.listScoreBatch).not.toHaveBeenCalled();
  });

  it("validates the evaluation date before repository access", async () => {
    const engagement: EngagementScoreRepository = {
      listScoreBatch: vi.fn(),
      upsertScore: vi.fn(),
    };

    await expect(recomputeEngagementScores(
      cronActor,
      new Date(Number.NaN),
      {engagement, batchSize: 2},
    )).rejects.toThrow("INVALID_ENGAGEMENT_AS_OF");
    expect(engagement.listScoreBatch).not.toHaveBeenCalled();
  });

  it("selects no personal fields and performs a stable conflict upsert", async () => {
    const occurredAt = new Date("2027-01-10T18:00:00.000Z");
    const fake = sequenceDatabase([
      [{profile_id: "profile-a"}],
      [{profile_id: "profile-a", points: 25, occurred_at: occurredAt}],
      [],
    ]);
    const repository = createEngagementScoreRepository(async () => fake.database);
    const input = {
      afterProfileId: null,
      asOf,
      limit: 100,
      windowStart: new Date(asOf.getTime() - 208 * DAY_MS),
    };

    await expect(repository.listScoreBatch(cronActor, input)).resolves.toEqual({
      profileIds: ["profile-a"],
      events: [{profileId: "profile-a", points: 25, occurredAt}],
    });
    await expect(repository.upsertScore(cronActor, {
      profileId: "profile-a",
      score: 12.3,
      trend: -4.5,
      computedAt: asOf,
    })).resolves.toBeUndefined();

    const sql = fake.commands.map((command) => command.sql.replace(/\s+/g, " "));
    expect(sql[0]).toMatch(/SELECT .*id.*profile_id.*FROM "profiles"/i);
    expect(sql[0]).not.toMatch(/email|phone|display_name|auth_user_id/i);
    expect(sql[1]).toMatch(/SELECT .*profile_id.*points.*occurred_at.*FROM "engagement_events"/i);
    expect(sql[1]).not.toMatch(/metadata|companies|profiles/i);
    expect(sql[2]).toMatch(/INSERT INTO "engagement_scores".*ON CONFLICT.*profile_id.*DO UPDATE/i);
    expect(fake.commands[2]?.params).toEqual(expect.arrayContaining([
      "profile-a",
      "12.30",
      "-4.50",
      asOf,
    ]));
  });
});
