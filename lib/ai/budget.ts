import "server-only";
import {MAX_AGENT_STEPS} from "@/lib/ai/provider";
import {calculateAgentCostMicrousd} from "@/lib/ai/pricing";
import type {AgentModelPrice} from "@/config/ai-pricing";
import type {ModelRoute} from "@/lib/ai/providers/registry";
import {
  aiBudgetRepository,
  type AiBudgetRequest,
  type AiSettlement,
} from "@/lib/db/repos/ai-budget";
export type AiBudgetPort = Readonly<{
  reserveAiBudget: (
    request: AiBudgetRequest,
  ) => Promise<
    | {ok: true; reservationId: string}
    | {ok: false; reason: "BUDGET_EXCEEDED" | "CONFIG_MISSING"}
  >;
  markDispatched: (id: string, providerRequestId?: string) => Promise<void>;
  releaseUndispatched: (id: string) => Promise<void>;
  settleAiBudget: (input: AiSettlement) => Promise<void>;
  recordProviderReceipt?: (id: string, requestId: string) => Promise<void>;
}>;
export const defaultAiBudgetPort: AiBudgetPort = aiBudgetRepository;
/** Eight bounded requests, retry count zero, including the highest allowed input cache-write rate. */
export function maximumAgentCostMicrousd(
  route: ModelRoute,
  prices: AgentModelPrice,
): number {
  const inputRate = Math.max(
    prices.inputUsdPerMillion,
    prices.cacheWriteUsdPerMillion ?? 0,
  );
  const perStep = calculateAgentCostMicrousd(
    {inputTokens: route.maxInputTokens, outputTokens: route.maxOutputTokens},
    {
      inputUsdPerMillion: inputRate,
      outputUsdPerMillion: prices.outputUsdPerMillion,
    },
    true,
  );
  const maximum = perStep * MAX_AGENT_STEPS;
  if (!Number.isSafeInteger(maximum)) throw Error("AGENT_COST_INVALID");
  return maximum;
}
