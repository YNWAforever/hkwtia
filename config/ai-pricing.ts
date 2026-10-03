export type AgentModelPrice = Readonly<{
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion?: number;
  cacheWriteUsdPerMillion?: number;
}>;

export const AI_MODEL_PRICING = {
  "openai:gpt-4.1-mini": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    cacheReadUsdPerMillion: 0.1,
  },
  "anthropic:claude-sonnet-4-6": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheReadUsdPerMillion: 0.3,
    cacheWriteUsdPerMillion: 3.75,
  },
} as const satisfies Readonly<Record<string, AgentModelPrice>>;

export type SupportedAgentModelKey = keyof typeof AI_MODEL_PRICING;

/** Existing model choice; provider routing imports this same server default. */
export const DEFAULT_AGENT_MODEL_KEY = "openai:gpt-4.1-mini" as const;
/** Verified first-party global standard rates. Existing uncached prices are unchanged. */
export const AI_PRICING_VERSION = "verified-2026-10-03" as const;

/** First-party standard text-embedding-3-small price, verified 2026-10-03. */
export const AI_EMBEDDING_PRICING:AgentModelPrice={inputUsdPerMillion:0.02,outputUsdPerMillion:0};
