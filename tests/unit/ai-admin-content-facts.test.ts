import { describe, it, expect, vi } from "vitest";
import {
  boardFactPackSchema,
  type BoardFactPack,
} from "@/lib/ai/board-reporter/contracts";
import { runBoardReporter } from "@/lib/ai/board-reporter/service";
import { automationCronActor } from "@/lib/auth/automation-actor";
import { previousHongKongMonthWindow } from "@/lib/ai/board-reporter/reporting-window";
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
const en = {
  executiveSummary: "Review the reporting window.",
  highlights: ["{{facts.mrrHkd}}"],
  risks: ["Review the follow-up queue."],
  recommendedActions: ["Review the source records."],
};
const zhHK = {
  executiveSummary: "請檢視報告期間。",
  highlights: ["{{facts.mrrHkd}}"],
  risks: ["請檢視跟進佇列。"],
  recommendedActions: ["請檢視來源紀錄。"],
};
function deps(summary = en.executiveSummary) {
  const saved: Record<string, unknown>[] = [];
  const createBoardDraftOnce = vi.fn(async (_a, input) => {
    saved.push(input);
    return { postId: "22222222-2222-4222-8222-222222222222", created: true };
  });
  const runJson = vi.fn(async (input) => {
    const bilingual = { en: { ...en, executiveSummary: summary }, zhHK };
    const output = input.outputSchema.parse(bilingual);
    await input.commit(output);
    return output;
  });
  return {
    saved,
    createBoardDraftOnce,
    runJson,
    service: {
      buildFactPack: async () => facts,
      agentRuns: { start: async () => ({}) },
      posts: { createBoardDraftOnce },
      runJson,
      createRunId: () => "11111111-1111-4111-8111-111111111111",
    },
  };
}
const config = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "Board report",
  runtime: {} as never,
};
const input = { asOf: new Date("2026-10-01T02:00:00Z"), agentConfig: config };
describe("T12 authoritative administrative content facts", () => {
  it("requires unavailable rather than zero for a zero denominator", () => {
    const p = structuredClone(facts);
    p.metrics[2].value = 0;
    expect(boardFactPackSchema.safeParse(p).success).toBe(false);
  });
  it("rejects a percentage that disagrees with its actual numerator and denominator", () => {
    const p = structuredClone(facts);
    p.metrics[8].value = 50;
    expect(boardFactPackSchema.safeParse(p).success).toBe(false);
  });
  it.each(["MRR was HKD 90.", "Revenue increased over the previous month."])(
    "validates the final narrative before saving: %s",
    async (text) => {
      const d = deps(text);
      await expect(
        runBoardReporter(automationCronActor(), input, d.service),
      ).rejects.toThrow();
      expect(d.saved).toEqual([]);
    },
  );
  it("persists an independently validated Chinese narrative and an application-owned Chinese title", async () => {
    const d = deps();
    await runBoardReporter(automationCronActor(), input, d.service);
    expect(d.saved[0].titleZh).toMatch(/\p{Script=Han}/u);
    expect(d.saved[0].bodyMdxZhHk).toContain("請檢視報告期間");
    expect(d.saved[0].bodyMdx).toContain("Review the reporting window");
  });
  it("uses Hong Kong month boundaries before UTC midnight", () => {
    const w = previousHongKongMonthWindow(new Date("2026-09-30T16:00:00Z"));
    expect(w.reportMonth).toBe("2026-09");
  });
});

it("reuses the existing monthly source result before creating a runtime or calling a provider", async () => {
  const d = deps();
  const getBoardDraftBySourceKey = vi.fn(async () => ({
    postId: "33333333-3333-4333-8333-333333333333",
    created: false,
  }));
  const result = await runBoardReporter(automationCronActor(), input, {
    ...d.service,
    posts: { ...d.service.posts, getBoardDraftBySourceKey },
  } as typeof d.service);
  expect(result?.postId).toBe("33333333-3333-4333-8333-333333333333");
  expect(d.runJson).not.toHaveBeenCalled();
  expect(d.saved).toEqual([]);
});

it("blocks a historical monthly post with an incomplete run before calling a provider", async () => {
  const d = deps();
  await expect(
    runBoardReporter(automationCronActor(), input, {
      ...d.service,
      posts: {
        ...d.service.posts,
        getBoardDraftBySourceKey: async () => ({
          postId: "33333333-3333-4333-8333-333333333333",
          created: false,
          completed: false,
        }),
      },
    }),
  ).rejects.toThrow("BOARD_PROVIDER_EFFECT_UNKNOWN");
  expect(d.runJson).not.toHaveBeenCalled();
});
