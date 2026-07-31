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
