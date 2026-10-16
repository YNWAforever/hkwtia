import {receiptAwareFetch} from "@/lib/ai/providers/request-receipt";
import "server-only";
import {DEFAULT_ADMIN_MODEL_REGISTRY, validateModelRoute, type ModelRoute} from "@/lib/ai/providers/registry";
import {
  createOpenAI,
  type OpenAIProviderSettings,
} from "@ai-sdk/openai";
import type {LanguageModel} from "ai";

import {
  createAiSdkAgentProvider,
  type AiSdkAdapterOverrides,
} from "@/lib/ai/providers/ai-sdk";
import type {AgentProvider} from "@/lib/ai/provider";

type OpenAIProviderFactory = (
  settings: OpenAIProviderSettings,
  protocol?: ModelRoute["protocol"],
) => (modelId: string) => LanguageModel;

const createProductionOpenAIProvider = (
  (settings: OpenAIProviderSettings, protocol: ModelRoute["protocol"] = "responses") => {
    const provider = createOpenAI(settings);
    return (modelId: string) => protocol === "chat-completions"
      ? provider.chat(modelId)
      : provider.responses(modelId);
  }
) satisfies OpenAIProviderFactory;

export type OpenAIAgentProviderDependencies = AiSdkAdapterOverrides & Readonly<{
  createProvider?: OpenAIProviderFactory;
}>;

export function createOpenAIAgentProvider(
  apiKey: string,
  dependencies: OpenAIAgentProviderDependencies = {},
  configuredRoute: ModelRoute = DEFAULT_ADMIN_MODEL_REGISTRY.concierge,
): AgentProvider {
  const route = validateModelRoute(configuredRoute);
  if (route.provider !== "openai") throw new Error("AI_ROUTE_PROVIDER_MISMATCH");
  const providerFactory = dependencies.createProvider
    ?? createProductionOpenAIProvider;
  const provider = dependencies.createProvider ? providerFactory({apiKey}, route.protocol) : undefined;

  return createAiSdkAgentProvider(
    (modelId, receipt) => (provider ?? createProductionOpenAIProvider({apiKey, fetch: receiptAwareFetch(receipt)}, route.protocol))(modelId),
    dependencies,
    route,
  );
}
