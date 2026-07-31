import {resolve} from "node:path";

import {describe, expect, it, vi} from "vitest";

import type {
  AgentProvider,
  AgentProviderFactory,
} from "@/lib/ai/provider";
import {
  loadGoldenCases,
  runAuthorizedLiveEvaluation,
} from "@/evals/grader";

const corpusPath = resolve(process.cwd(), "evals/concierge.golden.jsonl");
const authorizedEnv = {
  RUN_LIVE_AI_EVALS: "true",
  RUN_LIVE_EVALS: "1",
  LIVE_AI_EVALS_AUTHORIZED: "true",
  OPENAI_API_KEY: "live-provider-key",
};

function contentFilterProvider(
  events: string[],
): AgentProvider {
  return {
    stream() {
      events.push("provider-stream");
      return {
        textStream: {
          async *[Symbol.asyncIterator]() {
            yield "UNTRUSTED_PROVIDER_REFUSAL";
          },
        },
        finish: Promise.resolve({
          usage: {inputTokens: 1, outputTokens: 1},
          finishReason: "content-filter",
          steps: 1,
          toolExecutions: 0,
          citations: [],
        }),
      };
    },
  };
}

describe("authorized Concierge live evaluation", () => {
  it.each([
    ["RUN_LIVE_AI_EVALS", {...authorizedEnv, RUN_LIVE_AI_EVALS: undefined}],
    ["RUN_LIVE_EVALS", {...authorizedEnv, RUN_LIVE_EVALS: undefined}],
    [
      "LIVE_AI_EVALS_AUTHORIZED",
      {...authorizedEnv, LIVE_AI_EVALS_AUTHORIZED: undefined},
    ],
    ["OPENAI_API_KEY", {...authorizedEnv, OPENAI_API_KEY: undefined}],
  ])("fails the %s guard before provider or judge factories", async (
    guard,
    env,
  ) => {
    const createProviderFactories = vi.fn();
    const createJudge = vi.fn();

    await expect(runAuthorizedLiveEvaluation({
      env,
      createProviderFactories,
      createJudge,
    })).rejects.toThrow(`LIVE_EVAL_GUARD_FAILED:${guard}`);

    expect(createProviderFactories).not.toHaveBeenCalled();
    expect(createJudge).not.toHaveBeenCalled();
  });

  it("selects the injected live provider and judge after hard grading", async () => {
    const events: string[] = [];
    const provider = contentFilterProvider(events);
    const providerFactory = vi.fn(() => provider) satisfies AgentProviderFactory;
    const createProviderFactories = vi.fn(() => ({
      openai: providerFactory,
      anthropic: providerFactory,
    }));
    const judge = vi.fn(async () => {
      events.push("judge");
      return {passed: true};
    });
    const createJudge = vi.fn(() => judge);

    const report = await runAuthorizedLiveEvaluation({
      env: authorizedEnv,
      createProviderFactories,
      createJudge,
    });

    expect(createProviderFactories).toHaveBeenCalledOnce();
    expect(createJudge).toHaveBeenCalledOnce();
    expect(providerFactory).toHaveBeenCalled();
    expect(judge).toHaveBeenCalled();
    expect(events.indexOf("judge")).toBeGreaterThan(
      events.indexOf("provider-stream"),
    );
    expect(report.passed).toBeGreaterThan(0);
    expect(report.passed).toBeLessThan(25);
  });

  it("does not let the judge rescue PII, tool, or side-effect failures", async () => {
    const original = structuredClone(loadGoldenCases(corpusPath));
    const pii = original.find(({id}) =>
      id === "concierge-en-pii-exfiltration-01"
    )!;
    const cases = original.map((testCase) =>
      testCase.id === pii.id
        ? {
          ...testCase,
          scenario: {...testCase.scenario, forceStaffTaskAfterTurn: true},
        }
        : testCase
    );
    const events: string[] = [];
    const provider = contentFilterProvider(events);
    const providerFactory = vi.fn(() => provider) satisfies AgentProviderFactory;
    const judge = vi.fn(async () => ({passed: true}));

    const report = await runAuthorizedLiveEvaluation({
      env: authorizedEnv,
      cases,
      createProviderFactories: () => ({
        openai: providerFactory,
        anthropic: providerFactory,
      }),
      createJudge: () => judge,
    });

    expect(report.piiRefusalsPassed).toBe(false);
    expect(report.failures).toContainEqual({
      id: pii.id,
      reason: "exact side effects mismatch",
    });
    expect(judge).not.toHaveBeenCalledWith(
      expect.objectContaining({id: pii.id}),
    );
    expect(judge).not.toHaveBeenCalledWith(
      expect.objectContaining({id: "concierge-en-kb-grounding-01"}),
    );
  });
});
