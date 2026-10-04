// @vitest-environment node
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { createPostsRepository } from "@/lib/db/repos/posts";
import { createAgentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createAiBudgetRepository } from "@/lib/db/repos/ai-budget";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { runScheduledJson } from "@/lib/ai/scheduled-runtime";
import {
  runBoardReporter,
  type BoardReporterServiceDependencies,
} from "@/lib/ai/board-reporter/service";
import { automationCronActor } from "@/lib/auth/automation-actor";
import type { BoardFactPack } from "@/lib/ai/board-reporter/contracts";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import type { Database } from "@/lib/db/repos/common";
import type { AutomationDatabase } from "@/lib/db/repos/journeys";
import type { AgentProviderFactory } from "@/lib/ai/provider";
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const facts: BoardFactPack = {
  reportMonth: "2026-09",
  window: { from: "2026-09-01", to: "2026-09-30", timezone: "Asia/Hong_Kong" },
  metrics: [
    { id: "arr_hkd", value: 1200, unit: "HKD" },
    { id: "mrr_hkd", value: 100, unit: "HKD" },
    {
      id: "renewal_rate",
      value: null,
      unit: "percent",
      numerator: 0,
      denominator: 0,
    },
    {
      id: "first_year_renewal_rate",
      value: 50,
      unit: "percent",
      numerator: 1,
      denominator: 2,
    },
    { id: "funnel_started", value: 4, unit: "count" },
    { id: "funnel_profile_completed", value: 4, unit: "count" },
    { id: "funnel_checkout_or_review", value: 3, unit: "count" },
    { id: "funnel_activated", value: 3, unit: "count" },
    {
      id: "attendance_rate",
      value: 75,
      unit: "percent",
      numerator: 3,
      denominator: 4,
    },
    { id: "at_risk_count", value: 2, unit: "count" },
  ],
};
function realService(mode: "normal" | "timeout" | "changed" = "normal") {
  const clock = { at: new Date("2026-10-01T02:00:00Z") };
  const loader = async () => f.database as unknown as AutomationDatabase;
  const work = createDraftWorkRepository(
    (async () => f.database) as KbDatabaseLoader,
    () => clock.at,
    5,
  );
  const posts = createPostsRepository(
      async () => f.database as unknown as Database,
    ),
    runs = createAgentRunsRepository(loader);
  const budget = createAiBudgetRepository(
    loader,
    () => ({
      runMicrousd: 2_000_000,
      dayMicrousd: 5_000_000,
      monthMicrousd: 10_000_000,
    }),
    () => clock.at,
  );
  const calls = vi.fn();
  let changed = false;
  const provider: AgentProviderFactory = () => ({
    stream: async (request) => {
      calls();
      await request.onProviderReceipt?.("synthetic-board-" + randomUUID());
      if (mode === "timeout") throw Error("SYNTHETIC_ACCEPTED_TIMEOUT");
      if (mode === "changed") changed = true;
      const en = {
        executiveSummary: "Review the reporting window.",
        highlights: ["{{facts.mrrHkd}}"],
        risks: [],
        recommendedActions: ["Review source records."],
      };
      const zhHK = {
        executiveSummary: "請檢視報告期間。",
        highlights: ["{{facts.mrrHkd}}"],
        risks: [],
        recommendedActions: ["請檢視來源紀錄。"],
      };
      return {
        textStream: {
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify({ en, zhHK });
          },
        },
        finish: Promise.resolve({
          usage: { inputTokens: 100, outputTokens: 40 },
          steps: 1,
          toolExecutions: 0,
          finishReason: "stop",
          citations: [],
        }),
      };
    },
  });
  const config = {
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: { openaiApiKey: "synthetic-offline-provider" },
    system: "Draft only.",
    runtime: createAgentRuntime({
      agentRuns: runs,
      budget,
      providerFactories: { openai: provider, anthropic: provider },
      now: () => clock.at,
    }),
  };
  const deps = {
    buildFactPack: async () =>
      ({
        ...facts,
        metrics: facts.metrics.map((m, i) =>
          changed && i === 0 ? { ...m, value: 1400 } : m,
        ),
      }) as BoardFactPack,
    agentRuns: runs,
    posts,
    work,
    runJson: (
      input: Parameters<BoardReporterServiceDependencies["runJson"]>[0],
    ) => runScheduledJson(input),
    createRunId: randomUUID,
  };
  return {
    clock,
    calls,
    work,
    run: () =>
      runBoardReporter(
        automationCronActor(),
        { asOf: clock.at, agentConfig: config },
        deps,
      ),
  };
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "T12 real PostgreSQL board work/runtime/budget; synthetic provider only",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
    }, 120000);
    beforeEach(async () => {
      await f.pool.query(
        "TRUNCATE profiles,posts,ai_draft_work,agent_runs,ai_budget_reservations CASCADE",
      );
    });
    afterAll(async () => {
      if (f) await f.close();
    });
    it("claims before the provider and reuses one actual post across concurrent workers and days", async () => {
      const s = realService();
      const results = await Promise.all([s.run(), s.run()]);
      expect(s.calls).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r?.created)).toHaveLength(1);
      const p = (
        await f.pool.query(
          "SELECT id,body_mdx,body_mdx_zh_hk,published_at FROM posts",
        )
      ).rows;
      expect(p).toHaveLength(1);
      expect(p[0].body_mdx.replace(/\\\./g, ".")).toContain("$100.00");
      expect(p[0].body_mdx_zh_hk).toContain("請檢視報告期間");
      expect(p[0].published_at).toBeNull();
      expect(
        (await f.pool.query("SELECT state,post_id FROM ai_draft_work")).rows,
      ).toEqual([{ state: "succeeded", post_id: p[0].id }]);
      s.clock.at = new Date("2026-10-02T02:00:00Z");
      expect((await s.run())?.postId).toBe(p[0].id);
      expect(s.calls).toHaveBeenCalledTimes(1);
      expect(
        (
          await f.pool.query(
            "SELECT usage_state,actual_microusd::text AS cost FROM ai_budget_reservations",
          )
        ).rows,
      ).toEqual([{ usage_state: "known", cost: "104" }]);
    });
    it("holds accepted-timeout work and its budget across lease expiry and a new day", async () => {
      const s = realService("timeout");
      await expect(s.run()).rejects.toThrow();
      const held = (
        await f.pool.query(
          "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations",
        )
      ).rows;
      expect(held[0].usage_state).toBe("unknown");
      s.clock.at = new Date("2026-10-02T02:00:00Z");
      await expect(s.run()).rejects.toThrow();
      expect(s.calls).toHaveBeenCalledTimes(1);
      expect(
        (
          await f.pool.query(
            "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations",
          )
        ).rows,
      ).toEqual(held);
      expect(
        (await f.pool.query("SELECT state FROM ai_draft_work")).rows,
      ).toEqual([{ state: "unknown" }]);
      expect(
        (await f.pool.query("SELECT count(*)::int AS n FROM posts")).rows[0].n,
      ).toBe(0);
    });
    it("rejects a changed authoritative fact pack after provider acceptance without creating a post", async () => {
      const s = realService("changed");
      await expect(s.run()).rejects.toThrow();
      expect(s.calls).toHaveBeenCalledTimes(1);
      expect(
        (await f.pool.query("SELECT count(*)::int AS n FROM posts")).rows[0].n,
      ).toBe(0);
      expect(
        (await f.pool.query("SELECT state FROM ai_draft_work")).rows,
      ).toEqual([{ state: "unknown" }]);
    });
  },
);
