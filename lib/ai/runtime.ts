import {randomUUID} from "node:crypto";

import {
  requireAgentRunActor,
  type AgentRunActor,
} from "@/lib/auth/agent-actor";
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
  type AgentToolExecutionOptions,
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
  start: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
  configureModel: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
  finish: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
  fail: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
  escalate: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
  disable: (actor: AgentRunActor, input: unknown) => Promise<unknown>;
}>;

export type AgentRuntimeActorInput =
  | Readonly<{
    agent?: "concierge";
    conversationId: string;
    profileId: string | null;
    trigger: "web" | "whatsapp";
  }>
  | Readonly<{
    agent: "retention_analyst" | "board_reporter";
    conversationId: null;
    profileId: null;
    trigger: "scheduled";
  }>;

export type AgentRuntimeRequest = Readonly<{
  enabled: boolean;
  disabledCode?: AgentDisabledCode;
  model: string;
  credentials: Readonly<{
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }>;
  actor: AgentRuntimeActorInput;
  system: string;
  messages: AgentMessage[];
  tools: AgentToolSet;
  abortSignal?: AbortSignal;
  preparedRun?: AgentRuntimePreparedRun;
  finalization?: "automatic" | "deferred";
}>;

export type AgentRuntimePreparedRun = Readonly<{
  runId: string;
  fail: (error?: unknown) => Promise<AgentRuntimeError>;
}>;

export type AgentRuntimeFinalizationOverride = Readonly<{
  status: "escalated";
  code: AgentEscalationCode;
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

export type RefusedAgentRuntimeFinish = Readonly<{
  status: "refused";
  code: "content_filter";
  runId: string;
  usage: AgentUsage;
  costUsd: string;
  finishReason: "content-filter";
  steps: number;
  citations: [];
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
  | RefusedAgentRuntimeFinish
  | DisabledAgentRuntimeFinish;

export type AgentRuntimeStream = Readonly<{
  runId: string;
  /**
   * Single-consumer eager stream. Concurrent pending `next()` calls are
   * rejected. Consumer `return()`/`throw()` detaches delivery and discards
   * subsequent deltas without cancelling the provider; provider cancellation
   * remains controlled by the request AbortSignal.
   */
  textStream: AsyncIterable<string>;
  finish: Promise<AgentRuntimeFinish>;
  finalize: (
    override?: AgentRuntimeFinalizationOverride,
  ) => Promise<AgentRuntimeFinish>;
  fail: (error?: unknown) => Promise<AgentRuntimeError>;
}>;

export class AgentRuntimeError extends Error {
  readonly code: AgentFailureCode;
  readonly toolExecutions: number;

  constructor(code: AgentFailureCode, toolExecutions = 0) {
    super(`AI_RUNTIME_FAILED:${code}`);
    this.name = "AgentRuntimeError";
    this.code = code;
    this.toolExecutions = toolExecutions;
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
  toolExecutions = 0,
): AgentRuntimeError {
  if (
    error instanceof AgentRuntimeError
    && error.toolExecutions >= toolExecutions
  ) {
    return error;
  }
  return new AgentRuntimeError(
    failureCodeFor(error, abortSignal),
    toolExecutions,
  );
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
  stop: (error: unknown) => void;
}> {
  const queuedDeltas: string[] = [];
  let queuedCharacters = 0;
  let queueIndex = 0;
  let waiter: StreamWaiter | undefined;
  let completed = false;
  let failure: unknown;
  let iteratorCreated = false;
  let consumerDetached = false;
  let stopped = false;
  let sourceIterator: AsyncIterator<string> | undefined;
  let sourceClosed = false;

  function compactQueue(): void {
    if (queueIndex > 128 && queueIndex * 2 >= queuedDeltas.length) {
      queuedDeltas.splice(0, queueIndex);
      queueIndex = 0;
    }
  }

  function clearQueue(): void {
    queuedDeltas.length = 0;
    queuedCharacters = 0;
    queueIndex = 0;
  }

  function wakeConsumer(): void {
    if (!waiter) return;
    const pending = waiter;
    waiter = undefined;
    if (consumerDetached) {
      pending.resolve({value: undefined, done: true});
      return;
    }
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

  function detachConsumer(): void {
    consumerDetached = true;
    clearQueue();
    wakeConsumer();
  }

  function closeSource(): void {
    if (sourceClosed) return;
    sourceClosed = true;
    const sourceReturn = sourceIterator?.return;
    if (!sourceReturn || !sourceIterator) return;
    try {
      void Promise.resolve(sourceReturn.call(sourceIterator))
        .catch(() => undefined);
    } catch {
      // Source cleanup is best-effort and must never delay terminal failure.
    }
  }

  function stop(error: unknown): void {
    if (stopped) return;
    stopped = true;
    failure = error;
    clearQueue();
    wakeConsumer();
    closeSource();
  }

  const completion = (async () => {
    try {
      sourceIterator = source[Symbol.asyncIterator]();
      while (!stopped) {
        const result = await sourceIterator.next();
        if (stopped || result.done) break;
        const delta = result.value;
        if (typeof delta !== "string") {
          throw new AgentInvalidProviderResponseError();
        }
        if (delta.length === 0) continue;
        if (consumerDetached) continue;
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
      if (!stopped) {
        closeSource();
        failure = error;
        throw error;
      }
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
          if (consumerDetached) {
            return Promise.resolve({value: undefined, done: true});
          }
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
          if (waiter) {
            return Promise.reject(
              new AgentRuntimeError("invalid_provider_response"),
            );
          }
          return new Promise<IteratorResult<string>>((resolve, reject) => {
            waiter = {resolve, reject};
          });
        },
        return(value?: string): Promise<IteratorResult<string>> {
          detachConsumer();
          return Promise.resolve({value, done: true});
        },
        throw(error?: unknown): Promise<IteratorResult<string>> {
          detachConsumer();
          return Promise.reject(
            error ?? new AgentRuntimeError("invalid_provider_response"),
          );
        },
      };
    },
  };

  return {textStream, completion, stop};
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies) {
  const {
    agentRuns,
    providerFactories = defaultProviderFactories,
    createRunId = randomUUID,
    now = () => new Date(),
  } = dependencies;

  type Terminal = Readonly<{
    kind: "finish" | "fail" | "escalate" | "disable";
    failureCode?: AgentFailureCode;
    promise: Promise<unknown>;
  }>;
  type RunState = {
    actor: AgentRunActor;
    streamStarted: boolean;
    terminal?: Terminal;
  };
  const preparedStates = new WeakMap<AgentRuntimePreparedRun, RunState>();

  function settle(
    state: RunState,
    kind: Terminal["kind"],
    input: unknown,
    failureCode?: AgentFailureCode,
  ): Promise<unknown> {
    if (state.terminal) {
      if (state.terminal.kind !== kind) {
        throw new AgentRuntimeError(
          state.terminal.failureCode ?? "provider_error",
        );
      }
      return state.terminal.promise;
    }
    const method = agentRuns[kind];
    state.terminal = {
      kind,
      ...(failureCode === undefined ? {} : {failureCode}),
      promise: Promise.resolve().then(() => method(state.actor, input)),
    };
    return state.terminal.promise;
  }

  async function failState(
    state: RunState,
    error: unknown,
    billing: Readonly<{usage: AgentUsage; costUsd: string}> = {
      usage: ZERO_USAGE,
      costUsd: ZERO_COST,
    },
    abortSignal?: AbortSignal,
    toolExecutions = 0,
  ): Promise<AgentRuntimeError> {
    const runtimeError = publicRuntimeError(
      error,
      abortSignal,
      toolExecutions,
    );
    try {
      await settle(state, "fail", {
        completedAt: safeNow(now),
        errorCode: runtimeError.code,
        inputTokens: billing.usage.inputTokens,
        outputTokens: billing.usage.outputTokens,
        costUsd: billing.costUsd,
      }, runtimeError.code);
    } catch {
      // Terminal persistence errors remain private and never trigger a second
      // illegal transition.
    }
    return runtimeError;
  }

  function preparedRunFor(
    actorInput: AgentRuntimeRequest["actor"],
    runId: string,
  ): AgentRuntimePreparedRun {
    const actor: AgentRunActor = actorInput.trigger === "scheduled"
      ? {
        kind: "agent" as const,
        agent: actorInput.agent,
        runId,
        conversationId: null,
        profileId: null,
        trigger: "scheduled" as const,
      }
      : {
        kind: "agent" as const,
        agent: "concierge" as const,
        runId,
        conversationId: actorInput.conversationId,
        profileId: actorInput.profileId,
        trigger: actorInput.trigger,
      };
    requireAgentRunActor(actor);
    const state: RunState = {actor, streamStarted: false};
    const prepared = Object.freeze({
      runId,
      fail: (error: unknown = new AgentRuntimeError("provider_error")) =>
        failState(state, error),
    });
    preparedStates.set(prepared, state);
    return prepared;
  }

  async function prepareRun(
    actorInput: AgentRuntimeRequest["actor"],
  ): Promise<AgentRuntimePreparedRun> {
    const runId = createRunId();
    const prepared = preparedRunFor(actorInput, runId);
    const state = preparedStates.get(prepared)!;
    await agentRuns.start(state.actor, {
      provider: null,
      model: null,
      startedAt: safeNow(now),
    });
    return prepared;
  }

  return {
    prepare: prepareRun,
    adoptPrestarted(
      actorInput: AgentRuntimeRequest["actor"],
      runId: string,
    ): AgentRuntimePreparedRun {
      if (!runId.trim()) throw new AgentRuntimeError("configuration_error");
      return preparedRunFor(actorInput, runId);
    },

    async stream(request: AgentRuntimeRequest): Promise<AgentRuntimeStream> {
      const preparedRun = request.preparedRun ?? await prepareRun(request.actor);
      const state = preparedStates.get(preparedRun);
      if (!state) throw new AgentRuntimeError("configuration_error");
      const activeState = state;
      if (activeState.streamStarted) {
        throw new AgentRuntimeError("configuration_error");
      }
      activeState.streamStarted = true;
      const {actor} = activeState;
      const {runId} = actor;
      if (
        actor.agent !== (request.actor.agent ?? "concierge")
        || actor.conversationId !== request.actor.conversationId
        || actor.profileId !== request.actor.profileId
        || actor.trigger !== request.actor.trigger
      ) {
        throw await failState(
          state,
          new AgentRuntimeError("configuration_error"),
        );
      }

      const deferred = request.finalization === "deferred";
      let observedToolExecutions = 0;
      let latestBilling:
        | Readonly<{usage: AgentUsage; costUsd: string}>
        | undefined;
      const fail = (
        error: unknown = new AgentRuntimeError("provider_error"),
        billing = latestBilling,
      ) => failState(
        state,
        error,
        billing,
        request.abortSignal,
        observedToolExecutions,
      );

      async function finalizeOutcome(
        outcome: AgentRuntimeFinish,
        override?: AgentRuntimeFinalizationOverride,
      ): Promise<AgentRuntimeFinish> {
        const finalized = override === undefined
          ? outcome
          : outcome.status === "disabled"
            ? outcome
            : {...outcome, status: "escalated" as const, code: override.code};
        const terminalInput = {
          completedAt: safeNow(now),
          summaryCode: finalized.status === "completed"
            ? (observedToolExecutions > 0 ? "completed_with_tools" : "answered")
            : finalized.code,
          inputTokens: finalized.usage.inputTokens,
          outputTokens: finalized.usage.outputTokens,
          costUsd: finalized.costUsd,
        };
        try {
          if (finalized.status === "disabled") {
            await settle(activeState, "disable", terminalInput);
          } else if (finalized.status === "escalated") {
            await settle(activeState, "escalate", terminalInput);
          } else {
            await settle(activeState, "finish", terminalInput);
          }
        } catch (error) {
          throw await fail(error);
        }
        return finalized;
      }

      if (!request.enabled) {
        const code = request.disabledCode ?? "agent_disabled";
        const rawFinish = Promise.resolve<DisabledAgentRuntimeFinish>({
          status: "disabled",
          code,
          runId,
          usage: ZERO_USAGE,
          costUsd: ZERO_COST,
          finishReason: "disabled",
          steps: 0,
          citations: [],
        });
        const finish = deferred
          ? rawFinish
          : rawFinish.then((outcome) => finalizeOutcome(outcome)) as Promise<
            DisabledAgentRuntimeFinish
          >;
        return {
          runId,
          textStream: emptyTextStream(),
          finish,
          finalize: async (override) => finalizeOutcome(
            await rawFinish,
            override,
          ),
          fail,
        };
      }

      const wrappedTools: AgentToolSet = Object.freeze(Object.fromEntries(
        Object.entries(request.tools).map(([name, tool]) => [
          name,
          Object.freeze({
            ...tool,
            execute: async (
              input: unknown,
              options: AgentToolExecutionOptions,
            ) => {
              observedToolExecutions += 1;
              return tool.execute(input, options);
            },
          }),
        ]),
      ));

      let resolvedModel;
      let providerResult;
      try {
        resolvedModel = resolveAgentModel(request.model);
        await agentRuns.configureModel(actor, {
          provider: resolvedModel.provider,
          model: resolvedModel.modelId,
        });
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
          tools: wrappedTools,
          ...(request.abortSignal === undefined
            ? {}
            : {abortSignal: request.abortSignal}),
        });
      } catch (error) {
        throw await fail(error);
      }

      type Billing = Readonly<{usage: AgentUsage; costUsd: string}>;
      type ProviderFinishOutcome =
        | Readonly<{
          branch: "finish";
          status: "fulfilled";
          value: AgentStreamFinish;
          billing: Billing;
        }>
        | Readonly<{
          branch: "finish";
          status: "rejected";
          error: unknown;
        }>;
      type PumpOutcome =
        | Readonly<{branch: "pump"; status: "fulfilled"}>
        | Readonly<{branch: "pump"; status: "rejected"; error: unknown}>;

      let finishState:
        | Readonly<{status: "pending"}>
        | Readonly<{status: "fulfilled"; billing: Billing}>
        | Readonly<{status: "rejected"}>
        = {status: "pending"};
      const providerFinishOutcome: Promise<ProviderFinishOutcome> =
        Promise.resolve(providerResult.finish)
          .then(normalizeProviderFinish)
          .then(
            (value) => {
              observedToolExecutions = Math.max(
                observedToolExecutions,
                value.toolExecutions,
              );
              const billing = {
                usage: value.usage,
                costUsd: calculateAgentCostUsd(
                  value.usage,
                  resolvedModel.pricing,
                ),
              };
              latestBilling = billing;
              finishState = {status: "fulfilled", billing};
              return {
                branch: "finish",
                status: "fulfilled",
                value,
                billing,
              };
            },
            (error: unknown) => {
              finishState = {status: "rejected"};
              return {branch: "finish", status: "rejected", error};
            },
          );
      const pump = createEagerTextPump(
        providerResult.textStream,
        request.abortSignal,
      );
      const pumpOutcome: Promise<PumpOutcome> = pump.completion.then(
        () => ({branch: "pump", status: "fulfilled"}),
        (error: unknown) => ({branch: "pump", status: "rejected", error}),
      );

      function knownBilling(): Billing | undefined {
        return finishState.status === "fulfilled"
          ? finishState.billing
          : undefined;
      }

      async function rejectRuntimeFinish(
        error: unknown,
        billing: Billing | undefined,
        stopPump: boolean,
      ): Promise<never> {
        if (stopPump) pump.stop(error);
        throw await fail(error, billing);
      }

      const rawFinish = (async (): Promise<
        | CompletedAgentRuntimeFinish
        | EscalatedAgentRuntimeFinish
        | RefusedAgentRuntimeFinish
      > => {
        const first = await Promise.race([
          providerFinishOutcome,
          pumpOutcome,
        ]);
        let normalizedFinish: AgentStreamFinish;
        let billing: Billing;

        if (first.branch === "finish") {
          if (first.status === "rejected") {
            return rejectRuntimeFinish(first.error, undefined, true);
          }
          normalizedFinish = first.value;
          billing = first.billing;
          if (normalizedFinish.finishReason === "error") {
            return rejectRuntimeFinish(
              new AgentRuntimeError("provider_error", observedToolExecutions),
              billing,
              true,
            );
          }
          const pumpResult = await pumpOutcome;
          if (pumpResult.status === "rejected") {
            return rejectRuntimeFinish(pumpResult.error, billing, false);
          }
        } else {
          if (first.status === "rejected") {
            return rejectRuntimeFinish(first.error, knownBilling(), false);
          }
          const finishResult = await providerFinishOutcome;
          if (finishResult.status === "rejected") {
            return rejectRuntimeFinish(finishResult.error, undefined, true);
          }
          normalizedFinish = finishResult.value;
          billing = finishResult.billing;
          if (normalizedFinish.finishReason === "error") {
            return rejectRuntimeFinish(
              new AgentRuntimeError("provider_error", observedToolExecutions),
              billing,
              false,
            );
          }
        }

        if (
          normalizedFinish.steps === MAX_AGENT_STEPS
          && normalizedFinish.finishReason === "tool-calls"
        ) {
          const code: AgentEscalationCode = "tool_unavailable";
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
        if (normalizedFinish.finishReason === "content-filter") {
          return {
            status: "refused",
            code: "content_filter",
            runId,
            usage: billing.usage,
            costUsd: billing.costUsd,
            finishReason: "content-filter",
            steps: normalizedFinish.steps,
            citations: [],
          };
        }
        return {
          status: "completed",
          runId,
          usage: billing.usage,
          costUsd: billing.costUsd,
          finishReason: normalizedFinish.finishReason,
          steps: normalizedFinish.steps,
          citations: [...normalizedFinish.citations],
        };
      })();

      const finish = deferred
        ? rawFinish
        : rawFinish.then((outcome) => finalizeOutcome(outcome)) as Promise<
          | CompletedAgentRuntimeFinish
          | EscalatedAgentRuntimeFinish
          | RefusedAgentRuntimeFinish
        >;

      return {
        runId,
        textStream: pump.textStream,
        finish,
        finalize: async (override) => finalizeOutcome(
          await rawFinish,
          override,
        ),
        fail,
      };
    },
  };
}