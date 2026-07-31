import {
  AI_MODEL_PRICING,
  type AgentModelPrice,
  type SupportedAgentModelKey,
} from "@/config/ai-pricing";

export type AgentProviderName = "openai" | "anthropic";

export type AgentModel = Readonly<{
  provider: AgentProviderName;
  modelId: string;
}>;

export type ResolvedAgentModel = Readonly<{
  key: SupportedAgentModelKey;
  provider: AgentProviderName;
  modelId: string;
  pricing: AgentModelPrice;
}>;

export class AgentModelConfigurationError extends Error {
  constructor(code: "AGENT_MODEL_INVALID" | "AGENT_PROVIDER_UNSUPPORTED" | "AGENT_MODEL_UNSUPPORTED") {
    super(code);
    this.name = "AgentModelConfigurationError";
  }
}

export function parseAgentModel(model: string): AgentModel {
  const separator = model.indexOf(":");
  if (
    separator <= 0
    || separator !== model.lastIndexOf(":")
    || separator === model.length - 1
  ) {
    throw new AgentModelConfigurationError("AGENT_MODEL_INVALID");
  }

  const provider = model.slice(0, separator);
  if (provider !== "openai" && provider !== "anthropic") {
    throw new AgentModelConfigurationError("AGENT_PROVIDER_UNSUPPORTED");
  }

  return {
    provider,
    modelId: model.slice(separator + 1),
  };
}

export function resolveAgentModel(model: string): ResolvedAgentModel {
  const parsed = parseAgentModel(model);
  if (!(model in AI_MODEL_PRICING)) {
    throw new AgentModelConfigurationError("AGENT_MODEL_UNSUPPORTED");
  }

  const key = model as SupportedAgentModelKey;
  return {
    key,
    ...parsed,
    pricing: AI_MODEL_PRICING[key],
  };
}
