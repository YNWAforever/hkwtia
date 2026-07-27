import {randomUUID} from "node:crypto";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import {
  AgentModelConfigurationError,
  parseAgentModel,
  resolveAgentModel,
  type AgentProviderName,
} from "@/lib/ai/model";
import {
  AgentInvalidProviderResponseError,
  AgentToolExecutionError,
  MAX_AGENT_STEPS,
  normalizeAgentCitations,
  type AgentCitation,
  type AgentMessage,
  type AgentProviderFactory,
  type AgentStreamFinish,
  type AgentToolSet,
  type AgentUsage,
} from "@/lib/ai/provider";
import {calculateAgentCostUsd} from "@/lib/ai/pricing";
import {createAnthropicAgentProvider} from "@/lib/ai/providers/anthropic";
import {createOpenAIAgentProvider} from "@/lib/ai/providers/openai";

export type AgentFailureCode =
  | "provider_error"
  | "invalid_provider_response"
  | "tool_error"
  | "timeout"
  | "rate_limited"
  | "configuration_error";

export type AgentDisabledCode = "agent_disabled" | "channel_disabled";
export type AgentEscalationCode =
  | "human_requested"
  | "policy_boundary"
  | "low_confidence"
  | "tool_unavailable";

type AgentRunsLifecycle = Readonly<{
  start: (actor: ConciergeAgentActor, input: unknown) => Promise<unknown>;
  finish: (actor: ConciergeAgentActor, input: unknown) => Promise<unknown>;
  fail: (actor: ConciergeAgentActor, input: unknown) => Promise<unknown>;
  escalate: (actor: ConciergeAgentActor, input: unknown) => Promise<unknown>;
  disable: (actor: ConciergeAgentActor, input: unknown) => Promise<unknown>;
}>;

export type AgentRuntimeRequest = Readonly<{
  enabled: boolean;
  disabledCode?: AgentDisabledCode;
  model: string;
  credentials: Readonly<{
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }>;
  actor: Readonly<{
    conversationId: string;
    profileId: string | null;
    trigger: "web" | "whatsapp";
  }>;
  system: string;
  messages: AgentMessage[];
  tools: AgentToolSet;
  abortSignal?: AbortSignal;
}>;

export type CompletedAgentRuntimeFinish = Readonly<{
  status: "completed";
  runId: string;
  usage: AgentUsage;
  costUsd: string;
  finishReason: string;
  steps: number;
  citations: AgentCitation[];
}>;

export type EscalatedAgentRuntimeFinish = Readonly<{
  status: "escalated";
  code: AgentEscalationCode;
  runId: string;
  usage: AgentUsage;
  costUsd: string;
  finishReason: string;
  steps: number;
  citations: AgentCitation[];
}>;

export type DisabledAgentRuntimeFinish = Readonly<{
  status: "disabled";
  code: AgentDisabledCode;
  runId: string;
  usage: AgentUsage;
  costUsd: string;
  finishReason: "disabled";
  steps: 0;
  citations: [];
}>;

export type AgentRuntimeFinish =
  | CompletedAgentRuntimeFinish
  | EscalatedAgentRuntimeFinish
  | DisabledAgentRuntimeFinish;

export type AgentRuntimeStream = Readonly<{
  runId: string;
  textStream: AsyncIterable<string>;
  finish: Promise<AgentRuntimeFinish>;
}>;

export class AgentRuntimeError extends Error {
  readonly code: AgentFailureCode;

  constructor(code: AgentFailureCode) {
    super(`AI_RUNTIME_FAILED:${code}`);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}

type AgentRuntimeDependencies = Readonly<{
  agentRuns: AgentRunsLifecycle;
  providerFactories?: Readonly<Record<AgentProviderName, AgentProviderFactory>>;
  createRunId?: () => string;
  now?: () => Date;
}>;

const defaultProviderFactories: Readonly<
  Record<AgentProviderName, AgentProviderFactory>
> = {
  openai: ({apiKey}) => createOpenAIAgentProvider(apiKey),
  anthropic: ({apiKey}) => createAnthropicAgentProvider(apiKey),
};

const ZERO_USAGE: AgentUsage = {inputTokens: 0, outputTokens: 0};
const ZERO_COST = "0.000000";

function safeNow(now: () => Date): Date {
  const value = now();
  if (!Number.isFinite(value.getTime())) throw new Error("INVALID_RUNTIME_DATE");
  return value;
}

function apiKeyFor(
  provider: AgentProviderName,
  credentials: AgentRuntimeRequest["credentials"],
): string | undefined {
  return provider === "openai"
    ? credentials.openaiApiKey
    : credentials.anthropicApiKey;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : undefined;
}

function failureCodeFor(
  error: unknown,
  abortSignal?: AbortSignal,
): AgentFailureCode {
  if (error instanceof AgentRuntimeError) return error.code;
  if (error instanceof AgentModelConfigurationError) return "configuration_error";
  if (error instanceof AgentInvalidProviderResponseError) {
    return "invalid_provider_response";
  }
  if (error instanceof AgentToolExecutionError) return "tool_error";
  if (abortSignal?.aborted) return "timeout";
  if (numberProperty(error, "statusCode") === 429) return "rate_limited";

  const name = stringProperty(error, "name");
  const code = stringProperty(error, "code");
  if (
    name === "AbortError"
    || name === "TimeoutError"
    || code === "ETIMEDOUT"
    || code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return "timeout";
  }
  if (
    name === "AI_JSONParseError"
    || name === "AI_TypeValidationError"
    || name === "AI_InvalidToolInputError"
  ) {
    return "invalid_provider_response";
  }

  return "provider_error";
}

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

function normalizeProviderFinish(value: AgentStreamFinish): AgentStreamFinish {
  const usage = normalizeUsage(value?.usage);
  if (
    typeof value?.finishReason !== "string"
    || value.finishReason.length === 0
    || !Number.isSafeInteger(value.steps)
    || value.steps < 1
    || value.steps > MAX_AGENT_STEPS
    || !Number.isSafeInteger(value.toolExecutions)
    || value.toolExecutions < 0
    || !Array.isArray(value.citations)
  ) {
    throw new AgentInvalidProviderResponseError();
  }

  return {
    usage,
    finishReason: value.finishReason,
    steps: value.steps,
    toolExecutions: value.toolExecutions,
    citations: normalizeAgentCitations(value.citations),
  };
}

function emptyTextStream(): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      return;
    },
  };
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies) {
  const {
    agentRuns,
    providerFactories = defaultProviderFactories,
    createRunId = randomUUID,
    now = () => new Date(),
  } = dependencies;

  return {
    async stream(request: AgentRuntimeRequest): Promise<AgentRuntimeStream> {
      const parsedModel = parseAgentModel(request.model);
      const runId = createRunId();
      const actor: ConciergeAgentActor = {
        kind: "agent",
        agent: "concierge",
        runId,
        conversationId: request.actor.conversationId,
        profileId: request.actor.profileId,
        trigger: request.actor.trigger,
      };
      const startedAt = safeNow(now);
      await agentRuns.start(actor, {
        provider: parsedModel.provider,
        model: parsedModel.modelId,
        startedAt,
      });

      let terminal:
        | Readonly<{
          kind: "finish" | "fail" | "escalate" | "disable";
          failureCode?: AgentFailureCode;
          promise: Promise<unknown>;
        }>
        | undefined;

      function settle(
        kind: "finish" | "fail" | "escalate" | "disable",
        input: unknown,
        failureCode?: AgentFailureCode,
      ): Promise<unknown> {
        if (terminal) return terminal.promise;
        const method = agentRuns[kind];
        terminal = {
          kind,
          ...(failureCode === undefined ? {} : {failureCode}),
          promise: Promise.resolve(method(actor, input)),
        };
        return terminal.promise;
      }

      async function fail(error: unknown): Promise<AgentRuntimeError> {
        const code = failureCodeFor(error, request.abortSignal);
        const runtimeError = error instanceof AgentRuntimeError
          ? error
          : new AgentRuntimeError(code);
        try {
          await settle("fail", {
            completedAt: safeNow(now),
            errorCode: code,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: ZERO_COST,
          }, code);
        } catch {
          // A failed terminal persistence attempt must not expose database details
          // or trigger a second, illegal transition.
        }
        return runtimeError;
      }

      if (!request.enabled) {
        const code = request.disabledCode ?? "agent_disabled";
        const finish = (async (): Promise<DisabledAgentRuntimeFinish> => {
          await settle("disable", {
            completedAt: safeNow(now),
            summaryCode: code,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: ZERO_COST,
          });
          return {
            status: "disabled",
            code,
            runId,
            usage: ZERO_USAGE,
            costUsd: ZERO_COST,
            finishReason: "disabled",
            steps: 0,
            citations: [],
          };
        })();
        return {runId, textStream: emptyTextStream(), finish};
      }

      let resolvedModel;
      let providerResult;
      try {
        resolvedModel = resolveAgentModel(request.model);
        const apiKey = apiKeyFor(resolvedModel.provider, request.credentials);
        if (!apiKey?.trim()) {
          throw new AgentRuntimeError("configuration_error");
        }
        const factory = providerFactories[resolvedModel.provider];
        const provider = factory({apiKey});
        providerResult = await provider.stream({
          model: resolvedModel.modelId,
          system: request.system,
          messages: request.messages,
          tools: request.tools,
          ...(request.abortSignal === undefined
            ? {}
            : {abortSignal: request.abortSignal}),
        });
      } catch (error) {
        const configurationError =
          error instanceof AgentModelConfigurationError
          || error instanceof AgentRuntimeError
          ? error
          : new AgentRuntimeError("provider_error");
        throw await fail(configurationError);
      }

      const finish = Promise.resolve(providerResult.finish)
        .then(async (
          rawFinish,
        ): Promise<CompletedAgentRuntimeFinish | EscalatedAgentRuntimeFinish> => {
          if (terminal?.kind === "fail") {
            throw new AgentRuntimeError(
              terminal.failureCode ?? "provider_error",
            );
          }
          const providerFinish = normalizeProviderFinish(rawFinish);
          if (providerFinish.finishReason === "error") {
            throw new AgentRuntimeError("provider_error");
          }
          const costUsd = calculateAgentCostUsd(
            providerFinish.usage,
            resolvedModel.pricing,
          );
          if (
            providerFinish.steps === MAX_AGENT_STEPS
            && providerFinish.finishReason === "tool-calls"
          ) {
            const code: AgentEscalationCode = "tool_unavailable";
            await settle("escalate", {
              completedAt: safeNow(now),
              summaryCode: code,
              inputTokens: providerFinish.usage.inputTokens,
              outputTokens: providerFinish.usage.outputTokens,
              costUsd,
            });
            return {
              status: "escalated",
              code,
              runId,
              usage: providerFinish.usage,
              costUsd,
              finishReason: providerFinish.finishReason,
              steps: providerFinish.steps,
              citations: [...providerFinish.citations],
            };
          }
          await settle("finish", {
            completedAt: safeNow(now),
            summaryCode: providerFinish.toolExecutions > 0
              ? "completed_with_tools"
              : "answered",
            inputTokens: providerFinish.usage.inputTokens,
            outputTokens: providerFinish.usage.outputTokens,
            costUsd,
          });
          return {
            status: "completed",
            runId,
            usage: providerFinish.usage,
            costUsd,
            finishReason: providerFinish.finishReason,
            steps: providerFinish.steps,
            citations: [...providerFinish.citations],
          };
        })
        .catch(async (error): Promise<never> => {
          throw await fail(error);
        });

      const textStream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          try {
            for await (const delta of providerResult.textStream) {
              if (typeof delta !== "string") {
                throw new AgentInvalidProviderResponseError();
              }
              yield delta;
            }
          } catch (error) {
            throw await fail(error);
          }
        },
      };

      return {runId, textStream, finish};
    },
  };
}
