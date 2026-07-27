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
) => (modelId: string) => LanguageModel;

const createProductionOpenAIProvider = (
  (settings: OpenAIProviderSettings) => {
    const provider = createOpenAI(settings);
    return (modelId: string) => provider(
      modelId as Parameters<typeof provider>[0],
    );
  }
) satisfies OpenAIProviderFactory;

export type OpenAIAgentProviderDependencies = AiSdkAdapterOverrides & Readonly<{
  createProvider?: OpenAIProviderFactory;
}>;

export function createOpenAIAgentProvider(
  apiKey: string,
  dependencies: OpenAIAgentProviderDependencies = {},
): AgentProvider {
  const providerFactory = dependencies.createProvider
    ?? createProductionOpenAIProvider;
  const provider = providerFactory({apiKey});

  return createAiSdkAgentProvider(
    (modelId) => provider(modelId),
    dependencies,
  );
}
