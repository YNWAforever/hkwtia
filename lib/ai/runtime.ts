import {randomUUID} from "node:crypto";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import {
  AgentModelConfigurationError,
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

/**
 * Maximum number of UTF-16 characters retained for a consumer that is not
 * draining the returned text stream. The provider stream is pumped eagerly so
 * terminal persistence does not depend on the caller consuming text.
 */
export const MAX_BUFFERED_STREAM_CHARACTERS = 65_536;

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

function publicRuntimeError(
  error: unknown,
  abortSignal?: AbortSignal,
): AgentRuntimeError {
  return error instanceof AgentRuntimeError
    ? error
    : new AgentRuntimeError(failureCodeFor(error, abortSignal));
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

type StreamWaiter = Readonly<{
  resolve: (result: IteratorResult<string>) => void;
  reject: (error: AgentRuntimeError) => void;
}>;

function createEagerTextPump(
  source: AsyncIterable<string>,
  abortSignal?: AbortSignal,
): Readonly<{
  textStream: AsyncIterable<string>;
  completion: Promise<void>;
}> {
  const queuedDeltas: string[] = [];
  let queuedCharacters = 0;
  let queueIndex = 0;
  let waiter: StreamWaiter | undefined;
  let completed = false;
  let failure: unknown;
  let iteratorCreated = false;

  function compactQueue(): void {
    if (queueIndex > 128 && queueIndex * 2 >= queuedDeltas.length) {
      queuedDeltas.splice(0, queueIndex);
      queueIndex = 0;
    }
  }

  function wakeConsumer(): void {
    if (!waiter) return;
    const pending = waiter;
    waiter = undefined;
    if (queueIndex < queuedDeltas.length) {
      const value = queuedDeltas[queueIndex]!;
      queueIndex += 1;
      queuedCharacters -= value.length;
      compactQueue();
      pending.resolve({value, done: false});
      return;
    }
    if (failure !== undefined) {
      pending.reject(publicRuntimeError(failure, abortSignal));
      return;
    }
    if (completed) pending.resolve({value: undefined, done: true});
  }

  const completion = (async () => {
    try {
      for await (const delta of source) {
        if (typeof delta !== "string") {
          throw new AgentInvalidProviderResponseError();
        }
        if (delta.length === 0) continue;
        if (waiter) {
          queuedDeltas.push(delta);
          queuedCharacters += delta.length;
          wakeConsumer();
          continue;
        }
        if (
          queuedCharacters + delta.length
          > MAX_BUFFERED_STREAM_CHARACTERS
        ) {
          throw new AgentInvalidProviderResponseError();
        }
        queuedDeltas.push(delta);
        queuedCharacters += delta.length;
      }
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      completed = true;
      wakeConsumer();
    }
  })();

  const textStream: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (iteratorCreated) {
        return {
          next: async () => {
            throw new AgentRuntimeError("invalid_provider_response");
          },
        };
      }
      iteratorCreated = true;
      return {
        next(): Promise<IteratorResult<string>> {
          if (queueIndex < queuedDeltas.length) {
            const value = queuedDeltas[queueIndex]!;
            queueIndex += 1;
            queuedCharacters -= value.length;
            compactQueue();
            return Promise.resolve({value, done: false});
          }
          if (failure !== undefined) {
            return Promise.reject(publicRuntimeError(failure, abortSignal));
          }
          if (completed) {
            return Promise.resolve({value: undefined, done: true});
          }
          return new Promise<IteratorResult<string>>((resolve, reject) => {
            waiter = {resolve, reject};
          });
        },
      };
    },
  };

  return {textStream, completion};
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
        provider: null,
        model: null,
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

      async function fail(
        error: unknown,
        billing: Readonly<{usage: AgentUsage; costUsd: string}> = {
          usage: ZERO_USAGE,
          costUsd: ZERO_COST,
        },
      ): Promise<AgentRuntimeError> {
        const runtimeError = publicRuntimeError(error, request.abortSignal);
        try {
          await settle("fail", {
            completedAt: safeNow(now),
            errorCode: runtimeError.code,
            inputTokens: billing.usage.inputTokens,
            outputTokens: billing.usage.outputTokens,
            costUsd: billing.costUsd,
          }, runtimeError.code);
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
        throw await fail(error);
      }

      const pump = createEagerTextPump(
        providerResult.textStream,
        request.abortSignal,
      );
      const providerFinish = Promise.resolve(providerResult.finish)
        .then(normalizeProviderFinish);

      const finish = (async (): Promise<
        CompletedAgentRuntimeFinish | EscalatedAgentRuntimeFinish
      > => {
        let billing:
          | Readonly<{usage: AgentUsage; costUsd: string}>
          | undefined;
        try {
          const [finishResult, pumpResult] = await Promise.allSettled([
            providerFinish,
            pump.completion,
          ]);
          if (finishResult.status === "rejected") throw finishResult.reason;

          const normalizedFinish = finishResult.value;
          billing = {
            usage: normalizedFinish.usage,
            costUsd: calculateAgentCostUsd(
              normalizedFinish.usage,
              resolvedModel.pricing,
            ),
          };
          if (pumpResult.status === "rejected") throw pumpResult.reason;
          if (normalizedFinish.finishReason === "error") {
            throw new AgentRuntimeError("provider_error");
          }
          if (
            normalizedFinish.steps === MAX_AGENT_STEPS
            && normalizedFinish.finishReason === "tool-calls"
          ) {
            const code: AgentEscalationCode = "tool_unavailable";
            await settle("escalate", {
              completedAt: safeNow(now),
              summaryCode: code,
              inputTokens: billing.usage.inputTokens,
              outputTokens: billing.usage.outputTokens,
              costUsd: billing.costUsd,
            });
            return {
              status: "escalated",
              code,
              runId,
              usage: billing.usage,
              costUsd: billing.costUsd,
              finishReason: normalizedFinish.finishReason,
              steps: normalizedFinish.steps,
              citations: [...normalizedFinish.citations],
            };
          }
          await settle("finish", {
            completedAt: safeNow(now),
            summaryCode: normalizedFinish.toolExecutions > 0
              ? "completed_with_tools"
              : "answered",
            inputTokens: billing.usage.inputTokens,
            outputTokens: billing.usage.outputTokens,
            costUsd: billing.costUsd,
          });
          return {
            status: "completed",
            runId,
            usage: billing.usage,
            costUsd: billing.costUsd,
            finishReason: normalizedFinish.finishReason,
            steps: normalizedFinish.steps,
            citations: [...normalizedFinish.citations],
          };
        } catch (error) {
          throw await fail(error, billing);
        }
      })();

      return {runId, textStream: pump.textStream, finish};
    },
  };
}
