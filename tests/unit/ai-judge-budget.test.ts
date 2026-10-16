// @vitest-environment node
import {expect, it, vi} from "vitest";
import {defaultLiveJudge, type LiveJudgeInput} from "@/evals/grader";
import {syntheticAiBudget} from "../helpers/ai-budget";
const state = vi.hoisted(() => ({factory: vi.fn()}));
vi.mock("@/lib/ai/providers/openai", () => ({
  createOpenAIAgentProvider: state.factory,
}));
it("judge expenditure is reserved as judge before provider construction and settled", async () => {
  const budget = syntheticAiBudget();
  state.factory.mockImplementation(() => ({
    stream: () => ({
      textStream: {
        async *[Symbol.asyncIterator]() {
          yield '{"passed":true}';
        },
      },
      finish: Promise.resolve({
        usage: {inputTokens: 100, outputTokens: 10},
        finishReason: "stop",
        steps: 1,
        toolExecutions: 0,
        citations: [],
      }),
    }),
  }));
  const agentRuns = {
    start: vi.fn(),
    configureModel: vi.fn(),
    finish: vi.fn(),
    fail: vi.fn(),
    escalate: vi.fn(),
    disable: vi.fn(),
  };
  const judge = defaultLiveJudge({apiKey: "synthetic", budget, agentRuns});
  await expect(
    judge({
      id: "synthetic",
      locale: "en",
      request: {},
      expected: {},
      actual: {},
    } as LiveJudgeInput),
  ).resolves.toEqual({passed: true});
  expect(budget.reserveAiBudget).toHaveBeenCalledWith(
    expect.objectContaining({scope: "judge"}),
  );
  expect(vi.mocked(budget.reserveAiBudget).mock.invocationCallOrder[0]).toBeLessThan(
    state.factory.mock.invocationCallOrder[0]!,
  );
  expect(state.factory).toHaveBeenCalledWith("synthetic", {}, expect.objectContaining({maxOutputTokens: 1600}));
  expect(budget.settleAiBudget).toHaveBeenCalledWith(
    expect.objectContaining({usageState: "known", actualMicrousd: 56}),
  );
});
