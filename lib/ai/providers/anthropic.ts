import {
  createAnthropic,
  type AnthropicProviderSettings,
} from "@ai-sdk/anthropic";
import type {LanguageModel} from "ai";

import {
  createAiSdkAgentProvider,
  type AiSdkAdapterOverrides,
} from "@/lib/ai/providers/ai-sdk";
import type {AgentProvider} from "@/lib/ai/provider";

type AnthropicProviderFactory = (
  settings: AnthropicProviderSettings,
) => (modelId: string) => LanguageModel;

const createProductionAnthropicProvider = (
  (settings: AnthropicProviderSettings) => {
    const provider = createAnthropic(settings);
    return (modelId: string) => provider(
      modelId as Parameters<typeof provider>[0],
    );
  }
) satisfies AnthropicProviderFactory;

export type AnthropicAgentProviderDependencies =
  AiSdkAdapterOverrides & Readonly<{
    createProvider?: AnthropicProviderFactory;
  }>;

export function createAnthropicAgentProvider(
  apiKey: string,
  dependencies: AnthropicAgentProviderDependencies = {},
): AgentProvider {
  const providerFactory = dependencies.createProvider
    ?? createProductionAnthropicProvider;
  const provider = providerFactory({apiKey});

  return createAiSdkAgentProvider(
    (modelId) => provider(modelId),
    dependencies,
  );
}
