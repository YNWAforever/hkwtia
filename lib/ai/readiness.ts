import "server-only";

import {configuredAiBudgetLimits} from "@/lib/db/repos/ai-budget";
import {resolveAgentModel} from "@/lib/ai/model";
import {parseAiEnv} from "@/lib/config/env";

type Environment = Readonly<Partial<NodeJS.ProcessEnv>>;
export type AiReadiness = Readonly<{
  state: "ready" | "disabled" | "misconfigured";
  code: "READY" | "DISABLED" | "CONFIG_MISSING" | "CONFIG_INVALID";
  /** Server diagnostics only; never serialize configuration or values to visitors. */
  missingKeys: readonly string[];
}>;

/** No database, identity, model call or conversation is started by this probe. */
export function getAiReadiness(env: Environment = process.env): AiReadiness {
  if (env.AGENTS_ENABLED !== "true") {
    return {state: "disabled", code: "DISABLED", missingKeys: []};
  }
  const secret = env.CONCIERGE_COOKIE_SECRET;
  if (!secret?.trim()) {
    return {state: "misconfigured", code: "CONFIG_MISSING", missingKeys: ["CONCIERGE_COOKIE_SECRET"]};
  }
  if (Buffer.byteLength(secret, "utf8") < 32 || secret === env.NEON_AUTH_COOKIE_SECRET) {
    return {state: "misconfigured", code: "CONFIG_INVALID", missingKeys: ["CONCIERGE_COOKIE_SECRET"]};
  }
  try {
    // Keep the strict feature parser, including the independent cookie-secret checks.
    const parsed = parseAiEnv(env);
    const model = resolveAgentModel(parsed.agentModelConcierge);
    // Concierge knowledge embeddings use OpenAI even when generation uses Anthropic.
    const keys = model.provider === "anthropic"
      ? ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const
      : ["OPENAI_API_KEY"] as const;
    const budgetKeys = ["AI_BUDGET_RUN_MICROUSD", "AI_BUDGET_DAY_MICROUSD", "AI_BUDGET_MONTH_MICROUSD"];
    const missingKeys = [...keys.filter((key) => !env[key]?.trim()), ...budgetKeys.filter(key => !env[key]?.trim())];
    if (!missingKeys.length && !configuredAiBudgetLimits(env)) return {state: "misconfigured", code: "CONFIG_INVALID", missingKeys: budgetKeys};
    return missingKeys.length
      ? {state: "misconfigured", code: "CONFIG_MISSING", missingKeys}
      : {state: "ready", code: "READY", missingKeys: []};
  } catch {
    // Parser exceptions can contain configuration values. Never log/return them.
    return {state: "misconfigured", code: "CONFIG_INVALID", missingKeys: []};
  }
}
