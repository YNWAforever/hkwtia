import type {AgentProviderFactory, AgentStreamFinish} from "@/lib/ai/provider";
import type {AiBudgetPort} from "@/lib/ai/budget";
// @vitest-environment node
import {randomUUID} from "node:crypto";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createAgentRuntime} from "@/lib/ai/runtime";
const id = randomUUID();
function setup(
  mode: "ok" | "missing" | "exceeded" = "ok",
  providerError = false,
) {
  const runs = {
    start: vi.fn(async () => ({})),
    configureModel: vi.fn(async () => ({})),
    finish: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
    escalate: vi.fn(async () => ({})),
    disable: vi.fn(async () => ({})),
  };
  const budget = {
    reserveAiBudget: vi.fn(async () =>
      mode === "ok"
        ? {ok: true as const, reservationId: id}
        : {
            ok: false as const,
            reason:
              mode === "missing"
                ? ("CONFIG_MISSING" as const)
                : ("BUDGET_EXCEEDED" as const),
          },
    ),
    markDispatched: vi.fn(async () => {}),
    releaseUndispatched: vi.fn(async () => {}),
    settleAiBudget: vi.fn<AiBudgetPort["settleAiBudget"]>(async () => {}),
  };
  const factory = vi.fn<AgentProviderFactory>(() => ({
    stream: vi.fn(async () => {
      if (providerError) throw Error("synthetic timeout after dispatch");
      return {
        textStream: {
          async *[Symbol.asyncIterator]() {
            yield "synthetic";
          },
        },
        finish: Promise.resolve({
          usage: {
            inputTokens: 1000,
            outputTokens: 100,
            cacheReadTokens: 800,
            reasoningTokens: 50,
          },
          steps: 1,
          toolExecutions: 0,
          finishReason: "stop",
          citations: [],
        }),
      };
    }),
  }));
  const runtime = createAgentRuntime({
    agentRuns: runs,
    providerFactories: {openai: factory, anthropic: factory},
    budget,
  });
  return {runtime, runs, budget, factory};
}
const request = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {openaiApiKey: "synthetic-key"},
  actor: {
    conversationId: "synthetic-conversation",
    profileId: null,
    trigger: "web" as const,
  },
  system: "Synthetic facts only",
  messages: [{role: "user" as const, content: "synthetic"}],
  tools: {},
};
afterEach(() => vi.useRealTimers());
describe("mandatory runtime budget admission", () => {
  it.each(["missing", "exceeded"] as const)(
    "%s budget blocks provider construction and no fallback",
    async (mode) => {
      const {runtime, budget, factory, runs} = setup(mode);
      await expect(runtime.stream(request)).rejects.toMatchObject({
        code: mode === "missing" ? "configuration_error" : "rate_limited",
      });
      expect(budget.reserveAiBudget).toHaveBeenCalledOnce();
      expect(factory).not.toHaveBeenCalled();
      expect(budget.markDispatched).not.toHaveBeenCalled();
      expect(runs.fail).toHaveBeenCalledOnce();
    },
  );
  it("reserves worst-case eight bounded steps before dispatch and settles aggregate cache/reasoning once", async () => {
    const {runtime, budget, factory} = setup();
    const stream = await runtime.stream(request);
    const outcome = await stream.finish;
    expect(budget.reserveAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({scope: "concierge", maxCostMicrousd: 419840}),
    );
    expect(budget.reserveAiBudget.mock.invocationCallOrder[0]).toBeLessThan(
      factory.mock.invocationCallOrder[0]!,
    );
    expect(budget.markDispatched).toHaveBeenCalledOnce();
    expect(budget.settleAiBudget).toHaveBeenCalledWith({
      reservationId: id,
      usageState: "known",
      actualMicrousd: 320,
    });
    expect(outcome.costUsd).toBe("0.000320");
    expect(outcome.usage).toMatchObject({
      cacheReadTokens: 800,
      reasoningTokens: 50,
    });
  });
  it("a dispatched failure retains an unknown liability and never refunds it", async () => {
    const {runtime, budget, runs} = setup("ok", true);
    await expect(runtime.stream(request)).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(budget.settleAiBudget).toHaveBeenCalledWith({
      reservationId: id,
      usageState: "unknown",
      actualMicrousd: null,
    });
    expect(budget.releaseUndispatched).not.toHaveBeenCalled();
    expect(runs.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({usageState: "unknown", costUsd: null}),
    );
  });
  it("a rejected factory before dispatch releases only its own hold", async () => {
    const {runtime, budget, factory} = setup();
    factory.mockImplementation(() => {
      throw Error("not dispatched");
    });
    await expect(runtime.stream(request)).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(budget.releaseUndispatched).toHaveBeenCalledWith(id);
    expect(budget.markDispatched).not.toHaveBeenCalled();
  });
  it("interactive deadline stops waiting at twenty seconds but retains the unknown dispatched hold", async () => {
    vi.useFakeTimers();
    const {runtime, budget, factory} = setup();
    factory.mockImplementation(() => ({
      stream: vi.fn(async () => ({
        textStream: {
          async *[Symbol.asyncIterator]() {
            await new Promise(() => {});
            yield "never";
          },
        },
        finish: new Promise<AgentStreamFinish>(() => {}),
      })),
    }));
    const stream = await runtime.stream(request);
    let failureCode: string | undefined;
    void stream.finish.catch((error) => {
      failureCode = error.code;
    });
    await vi.advanceTimersByTimeAsync(20_001);
    expect(failureCode).toBe("timeout");
    expect(budget.settleAiBudget).toHaveBeenCalledWith({
      reservationId: id,
      usageState: "unknown",
      actualMicrousd: null,
    });
    expect(budget.releaseUndispatched).not.toHaveBeenCalled();
  }, 1000);
  it("a failed known settlement becomes a stable failure, never a completed or free run", async () => {
    const {runtime, budget, runs} = setup();
    budget.settleAiBudget.mockImplementation(async (input) => {
      if (input.usageState === "known") throw Error("private ledger failure");
    });
    const stream = await runtime.stream(request);
    await expect(stream.finish).rejects.toMatchObject({code: "provider_error"});
    expect(runs.fail).toHaveBeenCalledOnce();
    expect(runs.finish).not.toHaveBeenCalled();
  });
  it("late aggregate usage after timeout reconciles billing without a second provider dispatch", async () => {
    vi.useFakeTimers();
    const {runtime, budget, runs, factory} = setup();
    let report!: (value: import("@/lib/ai/provider").AgentStreamFinish) => void;
    const usage = new Promise<import("@/lib/ai/provider").AgentStreamFinish>(
      (resolve) => {
        report = resolve;
      },
    );
    const reconcile = vi.fn(async () => {});
    Object.assign(runs, {reconcileUsage: reconcile});
    factory.mockImplementation(() => ({
      stream: vi.fn(async () => ({
        textStream: {
          async *[Symbol.asyncIterator]() {
            yield "partial";
            await new Promise(() => {});
          },
        },
        finish: usage,
      })),
    }));
    const stream = await runtime.stream(request);
    void stream.finish.catch(() => {});
    await vi.advanceTimersByTimeAsync(20_001);
    expect(runs.fail).toHaveBeenCalledOnce();
    report({
      usage: {inputTokens: 1000, outputTokens: 100, cacheReadTokens: 800},
      finishReason: "stop",
      steps: 1,
      toolExecutions: 0,
      citations: [],
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(budget.settleAiBudget).toHaveBeenLastCalledWith({
      reservationId: id,
      usageState: "known",
      actualMicrousd: 320,
    });
    expect(reconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({usageState: "known", costUsd: "0.000320"}),
    );
    expect(factory).toHaveBeenCalledOnce();
    expect(budget.markDispatched).toHaveBeenCalledOnce();
    expect(runs.finish).not.toHaveBeenCalled();
  });
  it("disabled agents do not request funding or instantiate a provider", async () => {
    const {runtime, budget, factory} = setup();
    const stream = await runtime.stream({...request, enabled: false});
    expect((await stream.finish).status).toBe("disabled");
    expect(budget.reserveAiBudget).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
});
