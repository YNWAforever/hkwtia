import {
  createAnthropic,
  type AnthropicProviderSettings,
} from "@ai-sdk/anthropic";

import {
  createAiSdkAgentProvider,
  type AiSdkAdapterOverrides,
} from "@/lib/ai/providers/ai-sdk";
import type {AgentProvider} from "@/lib/ai/provider";

type AnthropicProviderFactory = (
  settings: AnthropicProviderSettings,
) => (modelId: string) => unknown;

export type AnthropicAgentProviderDependencies =
  AiSdkAdapterOverrides & Readonly<{
    createProvider?: AnthropicProviderFactory;
  }>;

export function createAnthropicAgentProvider(
  apiKey: string,
  dependencies: AnthropicAgentProviderDependencies = {},
): AgentProvider {
  const providerFactory = dependencies.createProvider
    ?? (createAnthropic as unknown as AnthropicProviderFactory);
  const provider = providerFactory({apiKey});

  return createAiSdkAgentProvider(
    (modelId) => provider(modelId),
    dependencies,
  );
}
