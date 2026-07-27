import {
  stepCountIs,
  streamText,
  tool,
} from "ai";
import type {ZodTypeAny} from "zod";

import {
  AgentInvalidProviderResponseError,
  AgentToolExecutionError,
  MAX_AGENT_STEPS,
  normalizeAgentCitations,
  type AgentProvider,
  type AgentStreamRequest,
  type AgentToolResult,
  type AgentUsage,
} from "@/lib/ai/provider";

type AiSdkToolDefinition = Readonly<{
  description: string;
  inputSchema: ZodTypeAny;
  strict: boolean;
  execute: (
    input: unknown,
    options: Readonly<{abortSignal?: AbortSignal}>,
  ) => Promise<unknown>;
}>;

type AiSdkStreamResult = Readonly<{
  textStream: AsyncIterable<string>;
  usage: PromiseLike<unknown>;
  finishReason: PromiseLike<unknown>;
  steps: PromiseLike<unknown>;
}>;

type AiSdkStreamText = (
  options: Record<string, unknown>,
) => AiSdkStreamResult;

type AiSdkDependencies = Readonly<{
  streamText: AiSdkStreamText;
  createTool: (definition: AiSdkToolDefinition) => unknown;
  createStopCondition: (
    count: number,
  ) => (input: {steps: unknown[]}) => boolean | PromiseLike<boolean>;
}>;

export type AiSdkAdapterOverrides = Partial<AiSdkDependencies>;

const defaultDependencies: AiSdkDependencies = {
  streamText: streamText as unknown as AiSdkStreamText,
  createTool: tool as unknown as AiSdkDependencies["createTool"],
  createStopCondition:
    stepCountIs as unknown as AiSdkDependencies["createStopCondition"],
};

function normalizeUsage(value: unknown): AgentUsage {
  if (!value || typeof value !== "object") {
    throw new AgentInvalidProviderResponseError();
  }

  const usage = value as {inputTokens?: unknown; outputTokens?: unknown};
  if (
    !Number.isSafeInteger(usage.inputTokens)
    || Number(usage.inputTokens) < 0
    || !Number.isSafeInteger(usage.outputTokens)
    || Number(usage.outputTokens) < 0
  ) {
    throw new AgentInvalidProviderResponseError();
  }

  return {
    inputTokens: Number(usage.inputTokens),
    outputTokens: Number(usage.outputTokens),
  };
}

function normalizeFinishReason(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AgentInvalidProviderResponseError();
  }
  return value;
}

function normalizeSteps(value: unknown): number {
  if (
    !Array.isArray(value)
    || value.length < 1
    || value.length > MAX_AGENT_STEPS
  ) {
    throw new AgentInvalidProviderResponseError();
  }
  return value.length;
}

function normalizeToolResult(value: unknown): AgentToolResult {
  if (!value || typeof value !== "object" || !("value" in value)) {
    throw new AgentInvalidProviderResponseError();
  }
  return value as AgentToolResult;
}

export function createAiSdkAgentProvider(
  createModel: (modelId: string) => unknown,
  overrides: AiSdkAdapterOverrides = {},
): AgentProvider {
  const dependencies = {...defaultDependencies, ...overrides};

  return {
    stream(request: AgentStreamRequest) {
      let toolExecutions = 0;
      let toolFailure: AgentToolExecutionError | undefined;
      const citationInputs: NonNullable<AgentToolResult["citations"]>[number][] = [];
      const tools = Object.fromEntries(
        Object.entries(request.tools).map(([name, agentTool]) => [
          name,
          dependencies.createTool({
            description: agentTool.description,
            inputSchema: agentTool.inputSchema,
            strict: agentTool.strict,
            execute: async (input, options) => {
              toolExecutions += 1;
              try {
                const result = normalizeToolResult(await agentTool.execute(input, {
                  ...(options.abortSignal === undefined
                    ? {}
                    : {abortSignal: options.abortSignal}),
                }));
                citationInputs.push(...(result.citations ?? []));
                return result.value;
              } catch (error) {
                toolFailure = error instanceof AgentToolExecutionError
                  ? error
                  : new AgentToolExecutionError({cause: error});
                throw toolFailure;
              }
            },
          }),
        ]),
      );
      const sdkResult = dependencies.streamText({
        model: createModel(request.model),
        system: request.system,
        messages: request.messages,
        tools,
        stopWhen: dependencies.createStopCondition(MAX_AGENT_STEPS),
        maxRetries: 0,
        ...(request.abortSignal === undefined
          ? {}
          : {abortSignal: request.abortSignal}),
        onError: () => undefined,
      });

      return {
        textStream: sdkResult.textStream,
        finish: Promise.all([
          Promise.resolve(sdkResult.usage),
          Promise.resolve(sdkResult.finishReason),
          Promise.resolve(sdkResult.steps),
        ]).then(([usage, finishReason, steps]) => {
          if (toolFailure) throw toolFailure;
          return {
            usage: normalizeUsage(usage),
            finishReason: normalizeFinishReason(finishReason),
            steps: normalizeSteps(steps),
            toolExecutions,
            citations: normalizeAgentCitations(citationInputs),
          };
        }),
      };
    },
  };
}
