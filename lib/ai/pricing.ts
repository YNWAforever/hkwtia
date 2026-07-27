import type {AgentModelPrice} from "@/config/ai-pricing";
import type {AgentUsage} from "@/lib/ai/provider";

function assertTokenCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("AGENT_USAGE_INVALID");
  }
}

export function calculateAgentCostUsd(
  usage: AgentUsage,
  pricing: AgentModelPrice,
): string {
  assertTokenCount(usage.inputTokens);
  assertTokenCount(usage.outputTokens);

  const cost = (
    usage.inputTokens * pricing.inputUsdPerMillion
    + usage.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;

  return cost.toFixed(6);
}
