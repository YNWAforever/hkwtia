export type AgentModelPrice = Readonly<{
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}>;

export const AI_MODEL_PRICING = {
  "openai:gpt-4.1-mini": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
  },
  "anthropic:claude-sonnet-4-6": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  },
} as const satisfies Readonly<Record<string, AgentModelPrice>>;

export type SupportedAgentModelKey = keyof typeof AI_MODEL_PRICING;

/** Existing model choice; provider routing imports this same server default. */
export const DEFAULT_AGENT_MODEL_KEY = "openai:gpt-4.1-mini" as const;
/** Historical repository rates, retained until T06 verifies a new price version. */
export const AI_PRICING_VERSION = "legacy-2026-10-03" as const;
