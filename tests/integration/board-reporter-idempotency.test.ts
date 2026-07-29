import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {
  BoardFactPack,
  BoardNarrative,
} from "@/lib/ai/board-reporter/contracts";
import {runBoardReporter} from "@/lib/ai/board-reporter/service";
import type {AgentConfig} from "@/lib/ai/scheduled-runtime";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createPostsRepository} from "@/lib/db/repos/posts";

const factPack: BoardFactPack = {
  reportMonth: "2026-06",
  window: {
    from: "2026-06-01",
    to: "2026-06-30",
    timezone: "Asia/Hong_Kong",
  },
  metrics: [
    {id: "arr_hkd", value: 3240, unit: "HKD"},
    {id: "mrr_hkd", value: 270, unit: "HKD"},
    {id: "renewal_rate", value: 66.7, unit: "percent", numerator: 2, denominator: 3},
    {id: "first_year_renewal_rate", value: 50, unit: "percent", numerator: 1, denominator: 2},
    {id: "funnel_started", value: 6, unit: "count"},
    {id: "funnel_profile_completed", value: 5, unit: "count"},
    {id: "funnel_checkout_or_review", value: 4, unit: "count"},
    {id: "funnel_activated", value: 3, unit: "count"},
    {id: "attendance_rate", value: 75, unit: "percent", numerator: 3, denominator: 4},
    {id: "at_risk_count", value: 2, unit: "count"},
  ],
};

const agentConfig = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "board reporter system",
  runtime: {},
} as AgentConfig;

describe("Board Reporter idempotency", () => {
  it("returns the same first-writer post for concurrent monthly invocations", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    let insertCall = 0;
    const database = drizzle(async (query, params) => {
      insertCall += 1;
      const currentCall = insertCall;
      statements.push({
        sql: query.replace(/\s+/g, " ").trim().toLowerCase(),
        params,
      });
      await Promise.resolve();
      return {
        rows: [{
          post_id: "22222222-2222-4222-8222-222222222222",
          created: currentCall === 1,
        }],
      };
    });
    const posts = createPostsRepository(async () => database as never);
    const runIds = [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111112",
    ];
    const runJson = vi.fn(async ({actor}): Promise<BoardNarrative> => ({
      executiveSummary: `Narrative from ${actor.runId}`,
      highlights: [],
      risks: [],
      recommendedActions: [],
    }));

    const results = await Promise.all(runIds.map((runId) =>
      runBoardReporter(
        automationCronActor(),
        {
          asOf: new Date("2026-07-29T02:00:00.000Z"),
          agentConfig,
        },
        {
          buildFactPack: vi.fn(async () => factPack),
          agentRuns: {start: vi.fn(async () => ({}))},
          runJson,
          posts,
          createRunId: () => runId,
        },
      )
    ));

    expect(results).toEqual([
      {
        reportMonth: "2026-06",
        postId: "22222222-2222-4222-8222-222222222222",
        created: true,
        metricCount: 10,
      },
      {
        reportMonth: "2026-06",
        postId: "22222222-2222-4222-8222-222222222222",
        created: false,
        metricCount: 10,
      },
    ]);
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.sql).toMatch(
        /on conflict.*source_key.*do update set source_key = excluded\.source_key/,
      );
      expect(statement.sql).not.toMatch(/body_mdx\s*=|agent_run_id\s*=/);
      expect(statement.params).toContain(
        "board-report:2026-06:board-reporter-v1",
      );
      expect(statement.params).toContain("board-report-2026-06");
    }
    expect(statements[0]?.params).toEqual(expect.arrayContaining([
      runIds[0],
      expect.stringContaining(`Agent run: **${runIds[0]}**`),
    ]));
    expect(statements[1]?.params).toEqual(expect.arrayContaining([
      runIds[1],
      expect.stringContaining(`Agent run: **${runIds[1]}**`),
    ]));
  });
});
