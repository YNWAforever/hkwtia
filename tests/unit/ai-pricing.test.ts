import {describe, expect, it} from "vitest";

import {AI_MODEL_PRICING} from "@/config/ai-pricing";
import {parseAgentModel, resolveAgentModel} from "@/lib/ai/model";
import {calculateAgentCostUsd} from "@/lib/ai/pricing";

describe("AI model pricing", () => {
  it("resolves the supported provider-qualified models with explicit prices", () => {
    expect(resolveAgentModel("openai:gpt-4.1-mini")).toEqual({
      key: "openai:gpt-4.1-mini",
      provider: "openai",
      modelId: "gpt-4.1-mini",
      pricing: {inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6},
    });
    expect(resolveAgentModel("anthropic:claude-sonnet-4-6")).toEqual({
      key: "anthropic:claude-sonnet-4-6",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      pricing: {inputUsdPerMillion: 3, outputUsdPerMillion: 15},
    });
    expect(Object.keys(AI_MODEL_PRICING)).toEqual([
      "openai:gpt-4.1-mini",
      "anthropic:claude-sonnet-4-6",
    ]);
  });

  it("keeps the canonical parser provider-qualified and provider-restricted", () => {
    expect(parseAgentModel("openai:gpt-4.1-mini")).toEqual({
      provider: "openai",
      modelId: "gpt-4.1-mini",
    });
    expect(() => parseAgentModel("google:gemini-pro")).toThrow("AGENT_PROVIDER_UNSUPPORTED");
  });

  it("rejects unknown models before they can receive a misleading zero price", () => {
    expect(() => resolveAgentModel("openai:gpt-unknown")).toThrow(
      "AGENT_MODEL_UNSUPPORTED",
    );
  });

  it("rounds aggregate token cost to six decimal places", () => {
    expect(calculateAgentCostUsd(
      {inputTokens: 1_234, outputTokens: 567},
      AI_MODEL_PRICING["openai:gpt-4.1-mini"],
    )).toBe("0.001401");
  });
});
