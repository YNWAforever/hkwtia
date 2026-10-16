import {describe, expect, it} from "vitest";
import {calculateAgentCostUsd} from "@/lib/ai/pricing";

const prices = {
  inputUsdPerMillion: 0.4,
  outputUsdPerMillion: 1.6,
  cacheReadUsdPerMillion: 0.1,
  cacheWriteUsdPerMillion: 0.5,
};
describe("aggregate AI usage billing", () => {
  it("charges cache reads at their verified rate rather than again as uncached input", () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };
    expect(calculateAgentCostUsd(usage, prices)).toBe("0.000320");
  });
  it("uses the cache write rate for that input subset without double billing", () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 200,
      cacheWriteTokens: 300,
      reasoningTokens: 40,
    };
    expect(calculateAgentCostUsd(usage, prices)).toBe("0.000530");
  });
  it("reasoning is already part of aggregate output and is never added twice", () => {
    const usage = {inputTokens: 1000, outputTokens: 100, reasoningTokens: 70};
    expect(calculateAgentCostUsd(usage, prices)).toBe("0.000560");
  });
  it.each([
    {inputTokens: 10, outputTokens: 5, cacheReadTokens: 11},
    {inputTokens: 10, outputTokens: 5, cacheReadTokens: 8, cacheWriteTokens: 3},
    {inputTokens: 10, outputTokens: 5, reasoningTokens: 6},
    {inputTokens: 10, outputTokens: 5, cacheReadTokens: -1},
  ])(
    "rejects impossible or negative usage details instead of a misleading cost %j",
    (usage) => {
      expect(() => calculateAgentCostUsd(usage, prices)).toThrow(
        "AGENT_USAGE_INVALID",
      );
    },
  );
  it("rejects totals outside the micro-USD safe-integer boundary", () => {
    expect(() =>
      calculateAgentCostUsd(
        {
          inputTokens: Number.MAX_SAFE_INTEGER,
          outputTokens: Number.MAX_SAFE_INTEGER,
        },
        prices,
      ),
    ).toThrow("AGENT_COST_INVALID");
  });
});
