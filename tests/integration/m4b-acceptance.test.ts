import {Pool} from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createBoardReporterPost,
} from "@/app/api/jobs/board-reporter/route";
import {
  createRetentionAnalystPost,
} from "@/app/api/jobs/retention-analyst/route";
import {
  boardFactPackSchema,
  type BoardFactPack,
} from "@/lib/ai/board-reporter/contracts";
import {buildBoardFactPack} from "@/lib/ai/board-reporter/facts";
import {runBoardReporter} from "@/lib/ai/board-reporter/service";
import type {RetentionCandidate} from "@/lib/ai/retention-analyst/candidates";
import {runRetentionAnalyst} from "@/lib/ai/retention-analyst/service";
import type {AgentConfig} from "@/lib/ai/scheduled-runtime";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {retentionAnalystRepository} from "@/lib/db/repos/retention-analyst";
import type {JobHandlerRepository} from "@/lib/jobs/handler";
import {
  assertM4BSeedEnvironment,
  buildM4BAcceptanceFixture,
  M4B_ACCEPTANCE_FIXTURE,
  seedM4B,
} from "@/scripts/seed-m4b";

const enabledAgent = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "M4B acceptance model stub",
  runtime: {},
} as AgentConfig;
const retentionCandidates: readonly RetentionCandidate[] =
  M4B_ACCEPTANCE_FIXTURE.profiles
    .filter(({qualifiesForRetention}) => qualifiesForRetention)
    .map((profile) => ({
      profileId: profile.id,
      membershipId: profile.membershipId,
      locale: "en",
      planCode: "startup",
      renewalDate: profile.renewalAt.toISOString().slice(0, 10),
      score: profile.score,
      trend: profile.trend < 0 ? "down" : "up",
      riskCodes: profile.id.includes("low-score")
        ? ["low_score_declining"]
        : profile.id.includes("inactive")
        ? ["inactive_before_renewal"]
        : ["low_score_declining", "inactive_before_renewal"],
    }));
const factPack: BoardFactPack = boardFactPackSchema.parse({
  reportMonth: M4B_ACCEPTANCE_FIXTURE.reportMonth,
  window: {
    from: "2030-06-01",
    to: "2030-06-30",
    timezone: "Asia/Hong_Kong",
  },
  metrics: M4B_ACCEPTANCE_FIXTURE.expectedBoardMetrics,
});

function jobRepository(): JobHandlerRepository {
  return {
    claim: vi.fn<JobHandlerRepository["claim"]>(
      async () => ({status: "claimed", attemptCount: 1}),
    ),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
  };
}

describe("M4B deterministic service acceptance", () => {
  it("creates exactly three approval-only retention drafts and reruns stay at three", async () => {
    const approvals = new Map<string, {
      id: string;
      profileId: string;
      status: "pending";
    }>();
    const deliveries: unknown[] = [];
    const model = vi.fn(async () => ({
      subject: "Membership check-in",
      body: "Hello {{first_name}}, your renewal date is {{renewal_date}}.",
      reasonCodes:
        ["inactive_before_renewal"] as ("inactive_before_renewal")[],
    }));
    let runIndex = 0;
    const dependencies = {
      candidates: {
        listCandidates: vi.fn(async () => retentionCandidates),
      },
      approvals: {
        hasPendingRetentionOutreach: vi.fn(
          async (_actor: unknown, profileId: string) =>
            [...approvals.values()].some((row) =>
              row.profileId === profileId && row.status === "pending"
            ),
        ),
        createRetentionOutreachOnce: vi.fn(
          async (_actor: unknown, input: {
            requestKey: string;
            profileId: string;
          }) => {
            const existing = approvals.get(input.requestKey);
            if (existing) return {approvalId: existing.id, created: false};
            const id =
              `41000001-0000-4000-8000-${String(
                approvals.size + 1,
              ).padStart(12, "0")}`;
            approvals.set(input.requestKey, {
              id,
              profileId: input.profileId,
              status: "pending",
            });
            return {approvalId: id, created: true};
          },
        ),
      },
      agentRuns: {
        start: vi.fn(async (actor: unknown, input: unknown) => {
          void actor;
          void input;
          return {};
        }),
      },
      runJson: model,
      createRunId: () => {
        runIndex += 1;
        return `41000002-0000-4000-8000-${String(runIndex).padStart(
          12,
          "0",
        )}`;
      },
    };

    const first = await runRetentionAnalyst(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: enabledAgent,
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      },
      dependencies,
    );
    const rerun = await runRetentionAnalyst(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: enabledAgent,
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      },
      dependencies,
    );

    expect(first).toEqual({
      considered: 3,
      drafted: 3,
      skippedPending: 0,
      deduplicated: 0,
      failed: 0,
    });
    expect(rerun).toEqual({
      considered: 3,
      drafted: 0,
      skippedPending: 3,
      deduplicated: 0,
      failed: 0,
    });
    expect([...approvals.values()]).toHaveLength(3);
    expect([...approvals.values()].map(({profileId}) => profileId).sort())
      .toEqual([...M4B_ACCEPTANCE_FIXTURE.expectedAtRiskProfileIds].sort());
    expect(model).toHaveBeenCalledTimes(3);
    for (const call of dependencies.agentRuns.start.mock.calls) {
      expect(call[1]).toMatchObject({
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      });
    }
    expect(deliveries).toHaveLength(0);
    expect(JSON.stringify([...approvals.values()])).not.toMatch(
      /sent|delivered|email_log|whatsapp_log/i,
    );
  });

  it("creates one unpublished page draft with exact KPIs and reruns stay at one", async () => {
    const posts = new Map<string, {
      id: string;
      kind: "page";
      publishedAt: null;
      bodyMdx: string;
    }>();
    const model = vi.fn(async () => ({
      executiveSummary: "Deterministic M4B acceptance month.",
      highlights: ["Three qualifying retention profiles."],
      risks: ["Approval review remains required."],
      recommendedActions: ["Review the staff-only queues."],
    }));
    let runIndex = 0;
    const dependencies = {
      buildFactPack: vi.fn(async () => factPack),
      agentRuns: {
        start: vi.fn(async (actor: unknown, input: unknown) => {
          void actor;
          void input;
          return {};
        }),
      },
      runJson: model,
      posts: {
        createBoardDraftOnce: vi.fn(
          async (
            _actor: ScheduledAgentActor,
            input: {sourceKey: string; bodyMdx: string},
          ) => {
            const existing = posts.get(input.sourceKey);
            if (existing) return {postId: existing.id, created: false};
            const post = {
              id: "42000001-0000-4000-8000-000000000001",
              kind: "page" as const,
              publishedAt: null,
              bodyMdx: input.bodyMdx,
            };
            posts.set(input.sourceKey, post);
            return {postId: post.id, created: true};
          },
        ),
      },
      createRunId: () => {
        runIndex += 1;
        return `42000002-0000-4000-8000-${String(runIndex).padStart(
          12,
          "0",
        )}`;
      },
    };

    const first = await runBoardReporter(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: enabledAgent,
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      },
      dependencies,
    );
    const rerun = await runBoardReporter(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: enabledAgent,
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      },
      dependencies,
    );

    expect(first).toMatchObject({
      reportMonth: "2030-06",
      created: true,
      metricCount: 10,
    });
    expect(rerun).toMatchObject({
      reportMonth: "2030-06",
      created: false,
      metricCount: 10,
    });
    expect(factPack.metrics).toEqual(
      M4B_ACCEPTANCE_FIXTURE.expectedBoardMetrics,
    );
    expect([...posts.values()]).toHaveLength(1);
    for (const call of dependencies.agentRuns.start.mock.calls) {
      expect(call[1]).toMatchObject({
        acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
      });
    }
    expect([...posts.values()][0]).toMatchObject({
      kind: "page",
      publishedAt: null,
    });
    expect([...posts.values()][0]?.bodyMdx).toContain(
      "| ARR | HKD 10,800 |",
    );
    expect([...posts.values()][0]?.bodyMdx).toContain(
      "| At-risk members | 3 |",
    );
  });

  it("kill switches prevent candidates, facts, model runs, approvals, and drafts", async () => {
    const retention = {
      listCandidates: vi.fn(),
      start: vi.fn(),
      model: vi.fn(),
      approval: vi.fn(),
      createRunId: vi.fn(),
    };
    const board = {
      facts: vi.fn(),
      start: vi.fn(),
      model: vi.fn(),
      post: vi.fn(),
      createRunId: vi.fn(),
    };

    await expect(runRetentionAnalyst(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: {...enabledAgent, enabled: false},
      },
      {
        candidates: {listCandidates: retention.listCandidates},
        approvals: {
          hasPendingRetentionOutreach: vi.fn(),
          createRetentionOutreachOnce: retention.approval,
        },
        agentRuns: {start: retention.start},
        runJson: retention.model,
        createRunId: retention.createRunId,
      },
    )).resolves.toEqual({
      considered: 0,
      drafted: 0,
      skippedPending: 0,
      deduplicated: 0,
      failed: 0,
    });
    await expect(runBoardReporter(
      automationCronActor(),
      {
        asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
        agentConfig: {...enabledAgent, enabled: false},
      },
      {
        buildFactPack: board.facts,
        agentRuns: {start: board.start},
        runJson: board.model,
        posts: {createBoardDraftOnce: board.post},
        createRunId: board.createRunId,
      },
    )).resolves.toBeNull();

    expect([
      retention.listCandidates,
      retention.start,
      retention.model,
      retention.approval,
      retention.createRunId,
      board.facts,
      board.start,
      board.model,
      board.post,
      board.createRunId,
    ].every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it("both cron routes return 401 before reads, runs, jobs, or drafts", async () => {
    const jobs = jobRepository();
    const retentionRunner = vi.fn();
    const retentionReader = vi.fn();
    const boardRunner = vi.fn();
    const boardReader = vi.fn();
    const secret = "m4b-acceptance-cron-secret";
    const retentionPost = createRetentionAnalystPost({
      candidates: {listCandidates: retentionReader},
      runner: retentionRunner,
      jobs,
      now: () => M4B_ACCEPTANCE_FIXTURE.asOf,
      secret: () => secret,
    });
    const boardPost = createBoardReporterPost({
      buildFactPack: boardReader,
      runner: boardRunner,
      jobs,
      now: () => M4B_ACCEPTANCE_FIXTURE.asOf,
      secret: () => secret,
    });

    const responses = await Promise.all([
      retentionPost(new Request(
        "http://localhost/api/jobs/retention-analyst",
        {method: "POST"},
      )),
      boardPost(new Request(
        "http://localhost/api/jobs/board-reporter",
        {method: "POST"},
      )),
    ]);

    expect(responses.map(({status}) => status)).toEqual([401, 401]);
    expect(retentionReader).not.toHaveBeenCalled();
    expect(retentionRunner).not.toHaveBeenCalled();
    expect(boardReader).not.toHaveBeenCalled();
    expect(boardRunner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
  });
});

const databaseAcceptanceEnabled =
  process.env.RUN_DATABASE_TESTS === "true"
  && process.env.RUN_M4B_ACCEPTANCE_TESTS === "true";

describe.skipIf(!databaseAcceptanceEnabled)(
  "M4B isolated PostgreSQL acceptance",
  () => {
    let pool: Pool;
    const databaseFixture = buildM4BAcceptanceFixture(
      M4B_ACCEPTANCE_FIXTURE.asOf,
    );

    beforeAll(async () => {
      const databaseUrl = process.env.DATABASE_URL_TEST?.trim();
      if (!databaseUrl) {
        throw new Error("DATABASE_URL_TEST is required for M4B DB acceptance.");
      }
      if (process.env.DATABASE_URL?.trim() !== databaseUrl) {
        throw new Error(
          "M4B DB acceptance requires DATABASE_URL === DATABASE_URL_TEST.",
        );
      }
      assertM4BSeedEnvironment({
        ...process.env,
        M4B_ACCEPTANCE_SEED: "true",
        DATABASE_URL: databaseUrl,
      });
      pool = new Pool({connectionString: databaseUrl});
      await seedM4B(pool, {asOf: databaseFixture.asOf});
      await seedM4B(pool, {asOf: databaseFixture.asOf});
    });

    afterAll(async () => {
      await pool?.end();
    });

    it("reconciles exactly three candidates and the exact previous-month KPIs", async () => {
      const candidates = await retentionAnalystRepository.listCandidates(
        automationCronActor(),
        {asOf: M4B_ACCEPTANCE_FIXTURE.asOf},
      );
      expect(candidates.map(({profileId}) => profileId)).toEqual(
        [...M4B_ACCEPTANCE_FIXTURE.expectedAtRiskProfileIds].sort(),
      );
      const actor: ScheduledAgentActor = {
        kind: "agent",
        agent: "board_reporter",
        runId: "43000001-0000-4000-8000-000000000001",
        conversationId: null,
        profileId: null,
        trigger: "scheduled",
      };
      const facts = await buildBoardFactPack(actor, M4B_ACCEPTANCE_FIXTURE.asOf);
      expect(facts.metrics).toEqual(
        M4B_ACCEPTANCE_FIXTURE.expectedBoardMetrics,
      );
    });

    it("starts with no M4B run, approval, post, email, or WhatsApp effects", async () => {
      const profileIds = M4B_ACCEPTANCE_FIXTURE.profiles.map(({id}) => id);
      const result = await pool.query<{
        approvals: number;
        posts: number;
        runs: number;
        emails: number;
        whatsapp: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM approvals
             WHERE request_key = ANY($2::text[]))
             AS approvals,
           (SELECT count(*)::int FROM posts
             WHERE source_key = $3)
             AS posts,
           (SELECT count(*)::int FROM agent_runs
             WHERE agent IN ('retention_analyst', 'board_reporter')
               AND (summary = $4 OR summary LIKE $5))
             AS runs,
           (SELECT count(*)::int FROM email_log
             WHERE profile_id = ANY($1::text[])) AS emails,
           (SELECT count(*)::int FROM whatsapp_log
             WHERE profile_id = ANY($1::text[])) AS whatsapp`,
        [
          profileIds,
          databaseFixture.retentionRequestKeys,
          databaseFixture.boardSourceKey,
          databaseFixture.agentRunOwnershipMarker,
          `${databaseFixture.agentRunOwnershipMarker}:%`,
        ],
      );
      expect(result.rows[0]).toEqual({
        approvals: 0,
        posts: 0,
        runs: 0,
        emails: 0,
        whatsapp: 0,
      });
    });

    it("removes rerun-orphaned fixture runs without touching unrelated runs", async () => {
      const orphanId = "44000001-0000-4000-8000-000000000001";
      const unrelatedId = "44000001-0000-4000-8000-000000000002";
      await pool.query(
        `INSERT INTO agent_runs
           (id, agent, conversation_id, profile_id, trigger, status, summary,
            started_at, created_at, updated_at)
         VALUES
           ($1, 'board_reporter', NULL, NULL, 'scheduled', 'completed', $3,
            $5, $5, $5),
           ($2, 'board_reporter', NULL, NULL, 'scheduled', 'completed', $4,
            $5, $5, $5)`,
        [
          orphanId,
          unrelatedId,
          `${databaseFixture.agentRunOwnershipMarker}:answered`,
          "unrelated-board-run",
          databaseFixture.asOf,
        ],
      );

      try {
        await seedM4B(pool, {asOf: databaseFixture.asOf});
        const remaining = await pool.query<{id: string}>(
          "SELECT id::text FROM agent_runs WHERE id = ANY($1::uuid[]) ORDER BY id",
          [[orphanId, unrelatedId]],
        );
        expect(remaining.rows).toEqual([{id: unrelatedId}]);
      } finally {
        await pool.query(
          "DELETE FROM agent_runs WHERE id = $1",
          [unrelatedId],
        );
      }
    });
  },
);
