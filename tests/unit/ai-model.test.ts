import {describe, expect, it} from "vitest";

import {parseAgentModel, parseServerEnv} from "@/lib/config/env";

describe("AI model configuration", () => {
  it("enables agents only for the exact true value", () => {
    expect(parseServerEnv({AGENTS_ENABLED: "true"}).agentsEnabled).toBe(true);
    expect(parseServerEnv({AGENTS_ENABLED: "TRUE"}).agentsEnabled).toBe(false);
    expect(parseServerEnv({AGENTS_ENABLED: "1"}).agentsEnabled).toBe(false);
    expect(parseServerEnv({}).agentsEnabled).toBe(false);
  });

  it("parses provider-qualified model names", () => {
    expect(parseAgentModel("openai:gpt-4.1-mini")).toEqual({
      provider: "openai",
      modelId: "gpt-4.1-mini",
    });
    expect(parseAgentModel("anthropic:claude-sonnet-4-20250514")).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
    });
  });

  it.each(["gpt-4.1-mini", "openai:", ":gpt-4.1-mini", "openai:gpt:4.1"])(
    "rejects a model name without exactly one provider separator: %s",
    (model) => {
      expect(() => parseAgentModel(model)).toThrow("AGENT_MODEL_INVALID");
    },
  );

  it("defaults Concierge to its provider-qualified model", () => {
    expect(parseServerEnv({}).agentModelConcierge).toBe("openai:gpt-4.1-mini");
  });
});
