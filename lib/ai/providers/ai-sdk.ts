import {validateAgentUsage} from "@/lib/ai/pricing";
import {assertRouteInputWithinBounds, type ModelRoute} from "@/lib/ai/providers/registry";
import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
} from "ai";
import type {ZodTypeAny} from "zod";

import {
  AgentInvalidProviderResponseError,
  AgentToolExecutionError,
  MAX_AGENT_CITATIONS,
  MAX_AGENT_STEPS,
  normalizeAgentCitations,
  type AgentProvider,
  type AgentStreamRequest,
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

const createAiSdkTool = (definition: AiSdkToolDefinition) => tool({
  description: definition.description,
  inputSchema: definition.inputSchema,
  strict: definition.strict,
  execute: async (input, options) => definition.execute(input, {
    ...(options.abortSignal === undefined
      ? {}
      : {abortSignal: options.abortSignal}),
  }),
});

type AiSdkStreamOptions = Parameters<typeof streamText>[0];
type AiSdkStreamResult = Readonly<{
  textStream: AsyncIterable<string>;
  usage: PromiseLike<unknown>;
  finishReason: PromiseLike<unknown>;
  steps: PromiseLike<unknown>;
}>;

type AiSdkDependencies = Readonly<{
  streamText: (options: AiSdkStreamOptions) => AiSdkStreamResult;
  createTool: (
    definition: AiSdkToolDefinition,
  ) => ReturnType<typeof createAiSdkTool>;
  createStopCondition: (
    count: number,
  ) => ReturnType<typeof stepCountIs>;
}>;

export type AiSdkAdapterOverrides = Partial<AiSdkDependencies>;

const productionStreamText = (
  (options: AiSdkStreamOptions): AiSdkStreamResult => streamText(options)
) satisfies AiSdkDependencies["streamText"];

const defaultDependencies = {
  streamText: productionStreamText,
  createTool: createAiSdkTool,
  createStopCondition: stepCountIs,
} satisfies AiSdkDependencies;

function normalizeUsage(value: unknown): AgentUsage {
  if (!value || typeof value !== "object") {
    throw new AgentInvalidProviderResponseError();
  }

  const usage = value as {inputTokens?: unknown; outputTokens?: unknown; inputTokenDetails?: {cacheReadTokens?: number; cacheWriteTokens?: number}; outputTokenDetails?: {reasoningTokens?: number}};
  if (
    !Number.isSafeInteger(usage.inputTokens)
    || Number(usage.inputTokens) < 0
    || !Number.isSafeInteger(usage.outputTokens)
    || Number(usage.outputTokens) < 0
  ) {
    throw new AgentInvalidProviderResponseError();
  }

  try {return validateAgentUsage({
    inputTokens: Number(usage.inputTokens), outputTokens: Number(usage.outputTokens),
    ...(usage.inputTokenDetails?.cacheReadTokens === undefined ? {} : {cacheReadTokens: usage.inputTokenDetails.cacheReadTokens}),
    ...(usage.inputTokenDetails?.cacheWriteTokens === undefined ? {} : {cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens}),
    ...(usage.outputTokenDetails?.reasoningTokens === undefined ? {} : {reasoningTokens: usage.outputTokenDetails.reasoningTokens}),
  });} catch {throw new AgentInvalidProviderResponseError();}
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

function normalizeToolResult(
  value: unknown,
): Readonly<{value: unknown; citations: unknown}> {
  if (!value || typeof value !== "object" || !("value" in value)) {
    throw new AgentInvalidProviderResponseError();
  }
  const record = value as Record<string, unknown>;
  return {
    value: record.value,
    citations: record.citations,
  };
}

function appendCitationInputs(target: unknown[], inputs: unknown): void {
  let inputCount: number;
  try {
    if (!Array.isArray(inputs)) return;
    inputCount = Math.min(
      inputs.length,
      MAX_AGENT_CITATIONS - target.length,
    );
  } catch {
    return;
  }

  for (let index = 0; index < inputCount; index += 1) {
    try {
      target.push(inputs[index]);
    } catch {
      return;
    }
  }
}

export function createAiSdkAgentProvider(
  createModel: (modelId: string, receipt?: AgentStreamRequest["onProviderReceipt"]) => LanguageModel,
  overrides: AiSdkAdapterOverrides = {},
  route?: ModelRoute,
): AgentProvider {
  const dependencies: AiSdkDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  return {
    stream(request: AgentStreamRequest) {
      if (route && (request.model !== route.modelId
        || (Object.keys(request.tools).length > 0 && !route.supportsTools))) {
        throw new Error("AI_ROUTE_REQUEST_MISMATCH");
      }
      let toolExecutions = 0;
      let toolFailure: AgentToolExecutionError | undefined;
      let providerFailure: unknown;
      const citationInputs: unknown[] = [];
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
                const result = normalizeToolResult(
                  await agentTool.execute(input, {
                    ...(options.abortSignal === undefined
                      ? {}
                      : {abortSignal: options.abortSignal}),
                  }),
                );
                appendCitationInputs(citationInputs, result.citations);
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
      const options = {
        model: createModel(request.model, request.onProviderReceipt),
        system: request.system,
        messages: request.messages,
        tools,
        stopWhen: dependencies.createStopCondition(MAX_AGENT_STEPS),
        maxRetries: 0,
        ...(route ? {
          maxOutputTokens: route.maxOutputTokens, timeout: route.timeoutMs,
          prepareStep: async ({messages}: {messages: readonly unknown[]}) => {
            await assertRouteInputWithinBounds(route, {...request, messages});
            return undefined;
          },
        } : {}),
        ...(request.abortSignal === undefined
          ? {}
          : {abortSignal: request.abortSignal}),
        // Preserve the original status/timeout for the runtime's fixed public code.
        // SDK usage can reject with a generic NoOutputGeneratedError instead.
        onError: ({error}) => { providerFailure = error; },

      } satisfies AiSdkStreamOptions;
      const sdkResult = dependencies.streamText(options);

      return {
        textStream: sdkResult.textStream,
        finish: Promise.all([
          Promise.resolve(sdkResult.usage),
          Promise.resolve(sdkResult.finishReason),
          Promise.resolve(sdkResult.steps),
        ]).then(([usage, finishReason, steps]) => {
          if (toolFailure) throw toolFailure;
          if (providerFailure !== undefined) throw providerFailure;
          return {
            usage: normalizeUsage(usage),
            finishReason: normalizeFinishReason(finishReason),
            steps: normalizeSteps(steps),
            toolExecutions,
            citations: normalizeAgentCitations(citationInputs),
          };
        }).catch((error: unknown) => {
          if (toolFailure) throw toolFailure;
          throw providerFailure ?? error;
        }),
      };
    },
  };
}
