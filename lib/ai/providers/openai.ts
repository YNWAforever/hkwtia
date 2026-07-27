import {
  createOpenAI,
  type OpenAIProviderSettings,
} from "@ai-sdk/openai";

import {
  createAiSdkAgentProvider,
  type AiSdkAdapterOverrides,
} from "@/lib/ai/providers/ai-sdk";
import type {AgentProvider} from "@/lib/ai/provider";

type OpenAIProviderFactory = (
  settings: OpenAIProviderSettings,
) => (modelId: string) => unknown;

export type OpenAIAgentProviderDependencies = AiSdkAdapterOverrides & Readonly<{
  createProvider?: OpenAIProviderFactory;
}>;

export function createOpenAIAgentProvider(
  apiKey: string,
  dependencies: OpenAIAgentProviderDependencies = {},
): AgentProvider {
  const providerFactory = dependencies.createProvider
    ?? (createOpenAI as unknown as OpenAIProviderFactory);
  const provider = providerFactory({apiKey});

  return createAiSdkAgentProvider(
    (modelId) => provider(modelId),
    dependencies,
  );
}
