import {describe, expect, it, vi} from "vitest";

import type {
  BoardFactPack,
  BoardNarrative,
} from "@/lib/ai/board-reporter/contracts";
import {runScheduledJson, type AgentConfig} from "@/lib/ai/scheduled-runtime";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {automationCronActor} from "@/lib/auth/automation-actor";
import type {BoardDraftInput} from "@/lib/db/repos/posts";
import {scheduledRuntimeHarness} from "@/tests/fixtures/scheduled-runtime-harness";

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

const narrative: BoardNarrative = {
  executiveSummary: "Stable month.",
  highlights: ["Three applications activated."],
  risks: ["Two members require attention."],
  recommendedActions: ["Review the retention queue."],
};

const agentConfig = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "board reporter system",
  runtime: {},
} as AgentConfig;

async function loadService() {
  const modulePath = "../../lib/ai/board-reporter/service.ts";
  const serviceModule = await import(/* @vite-ignore */ modulePath)
    .catch(() => null);
  expect(serviceModule).not.toBeNull();
  return serviceModule;
}

describe("Board Reporter service", () => {
  it("uses one fact pack and run to create the deterministic unpublished monthly draft", async () => {
    const serviceModule = await loadService();
    if (!serviceModule) return;

    const order: string[] = [];
    const buildFactPack = vi.fn(async () => {
      order.push("facts");
      return factPack;
    });
    const start = vi.fn(async () => {
      order.push("start");
      return {};
    });
    const runJson = vi.fn(async (input) => {
      order.push("model");
      expect(input.outputSchema.parse(narrative)).toEqual(narrative);
      await input.commit?.(narrative);
      return narrative;
    });
    const createBoardDraftOnce = vi.fn(async (
      actor: ScheduledAgentActor,
      input: BoardDraftInput,
    ) => {
      void actor;
      void input;
      order.push("post");
      return {
        postId: "22222222-2222-4222-8222-222222222222",
        created: true,
      };
    });
    const asOf = new Date("2026-07-29T02:00:00.000Z");

    await expect(serviceModule.runBoardReporter(
      automationCronActor(),
      {asOf, agentConfig},
      {
        buildFactPack,
        agentRuns: {start},
        runJson,
        posts: {createBoardDraftOnce},
        createRunId: () => "11111111-1111-4111-8111-111111111111",
      },
    )).resolves.toEqual({
      reportMonth: "2026-06",
      postId: "22222222-2222-4222-8222-222222222222",
      created: true,
      metricCount: 10,
    });

    expect(order).toEqual(["facts", "start", "model", "post"]);
    const scheduledActor = {
      kind: "agent",
      agent: "board_reporter",
      runId: "11111111-1111-4111-8111-111111111111",
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
    };
    expect(buildFactPack).toHaveBeenCalledWith(scheduledActor, asOf);
    expect(start).toHaveBeenCalledWith(scheduledActor, {
      provider: null,
      model: null,
      startedAt: asOf,
    });
    expect(runJson).toHaveBeenCalledWith(expect.objectContaining({
      actor: scheduledActor,
      agentConfig,
      prompt: expect.stringContaining('"reportMonth":"2026-06"'),
    }));
    expect(createBoardDraftOnce).toHaveBeenCalledWith(
      scheduledActor,
      expect.objectContaining({
        sourceKey: "board-report:2026-06:board-reporter-v1",
        slug: "board-report-2026-06",
        titleEn: "Board report: 2026-06",
        titleZh: "Board report: 2026-06",
        bodyMdx: expect.stringContaining("| ARR | HKD 3,240 |"),
      }),
    );
    const draftInput = createBoardDraftOnce.mock.calls[0]?.[1];
    expect(draftInput?.bodyMdx).toContain("| Renewal rate | 66.7% (2/3) |");
    expect(draftInput?.bodyMdx).toContain(
      "Agent run: **11111111-1111-4111-8111-111111111111**",
    );
  });

  it("does not read facts, create a run, invoke the model, or create a post when disabled", async () => {
    const serviceModule = await loadService();
    if (!serviceModule) return;
    const buildFactPack = vi.fn();
    const start = vi.fn();
    const runJson = vi.fn();
    const createBoardDraftOnce = vi.fn();

    await expect(serviceModule.runBoardReporter(
      automationCronActor(),
      {
        asOf: new Date("2026-07-29T02:00:00.000Z"),
        agentConfig: {...agentConfig, enabled: false},
      },
      {
        buildFactPack,
        agentRuns: {start},
        runJson,
        posts: {createBoardDraftOnce},
        createRunId: vi.fn(),
      },
    )).resolves.toBeNull();

    expect(buildFactPack).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(runJson).not.toHaveBeenCalled();
    expect(createBoardDraftOnce).not.toHaveBeenCalled();
  });

  it("creates no post when model or schema validation fails", async () => {
    const serviceModule = await loadService();
    if (!serviceModule) return;
    const createBoardDraftOnce = vi.fn();

    await expect(serviceModule.runBoardReporter(
      automationCronActor(),
      {
        asOf: new Date("2026-07-29T02:00:00.000Z"),
        agentConfig,
      },
      {
        buildFactPack: vi.fn(async () => factPack),
        agentRuns: {start: vi.fn(async () => ({}))},
        runJson: vi.fn(async () => {
          throw new Error("invalid_provider_response");
        }),
        posts: {createBoardDraftOnce},
        createRunId: () => "11111111-1111-4111-8111-111111111111",
      },
    )).rejects.toThrow("invalid_provider_response");

    expect(createBoardDraftOnce).not.toHaveBeenCalled();
  });

  it("fails the same agent run when the durable post commit fails", async () => {
    const serviceModule = await loadService();
    if (!serviceModule) return;
    const agentActor: ScheduledAgentActor = {
      kind: "agent",
      agent: "board_reporter",
      runId: "11111111-1111-4111-8111-111111111111",
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
    };
    const runtime = scheduledRuntimeHarness(
      JSON.stringify(narrative),
      agentActor,
    );

    await expect(serviceModule.runBoardReporter(
      automationCronActor(),
      {asOf: new Date("2026-07-29T02:00:00.000Z"), agentConfig: runtime.agentConfig},
      {
        buildFactPack: vi.fn(async () => factPack),
        agentRuns: {start: vi.fn(async () => ({}))},
        runJson: runScheduledJson,
        posts: {createBoardDraftOnce: vi.fn(async () => {
          throw new Error("private post database detail");
        })},
        createRunId: () => agentActor.runId,
      },
    )).rejects.toMatchObject({
      code: "tool_error",
      message: "AI_RUNTIME_FAILED:tool_error",
    });

    expect(runtime.fail).toHaveBeenCalledWith(expect.objectContaining({
      code: "tool_error",
    }));
    expect(JSON.stringify(runtime.fail.mock.calls)).not.toContain(
      "private post database detail",
    );
    expect(runtime.finalize).not.toHaveBeenCalled();
  });
});
