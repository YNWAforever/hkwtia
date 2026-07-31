import {describe, expect, it, vi} from "vitest";

import {
  AgentRuntimeError,
  MAX_BUFFERED_STREAM_CHARACTERS,
  createAgentRuntime,
} from "@/lib/ai/runtime";
import type {
  AgentProvider,
  AgentStreamFinish,
  AgentToolSet,
} from "@/lib/ai/provider";

const RUN_ID = "019f6bb0-f721-7eb8-9a6b-112233445566";
const STARTED_AT = new Date("2026-07-27T01:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-27T01:00:01.000Z");

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

async function flushMicrotasks(): Promise<void> {
  for (let count = 0; count < 8; count += 1) await Promise.resolve();
}

function successfulFinish(
  overrides: Partial<AgentStreamFinish> = {},
): AgentStreamFinish {
  return {
    usage: {inputTokens: 1_000, outputTokens: 500},
    finishReason: "stop",
    steps: 2,
    toolExecutions: 0,
    citations: [],
    ...overrides,
  };
}

function createAgentRunsFake() {
  return {
    start: vi.fn(async () => ({id: RUN_ID})),
    configureModel: vi.fn(async () => ({id: RUN_ID})),
    finish: vi.fn(async () => ({id: RUN_ID})),
    fail: vi.fn(async () => ({id: RUN_ID})),
    escalate: vi.fn(async () => ({id: RUN_ID})),
    disable: vi.fn(async () => ({id: RUN_ID})),
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "openai-test-key"},
    actor: {
      conversationId: "conversation-1",
      profileId: "profile-1",
      trigger: "web" as const,
    },
    system: "Answer safely.",
    messages: [{role: "user" as const, content: "Question"}],
    tools: {} satisfies AgentToolSet,
    ...overrides,
  };
}

function createRuntime(
  agentRuns: ReturnType<typeof createAgentRunsFake>,
  provider: AgentProvider,
) {
  return createAgentRuntime({
    agentRuns,
    providerFactories: {
      openai: () => provider,
      anthropic: vi.fn(),
    },
    createRunId: () => RUN_ID,
    now: vi.fn()
      .mockReturnValueOnce(STARTED_AT)
      .mockReturnValue(COMPLETED_AT),
  });
}

function rejectingSource(error: unknown): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          throw error;
        },
      };
    },
  };
}

describe("re-review: fail-fast asymmetric provider branches", () => {
  it("fails when the pump throws even if provider finish never settles", async () => {
    const finish = deferred<AgentStreamFinish>();
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: rejectingSource(
          Object.assign(new Error("provider secret"), {statusCode: 429}),
        ),
        finish: finish.promise,
      }),
    });

    const result = await runtime.stream(request());
    void result.finish.catch(() => undefined);
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({errorCode: "rate_limited"}),
    );
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });

  it("fails on finish rejection and stops a stalled source iterator", async () => {
    const stalledNext = deferred<IteratorResult<string>>();
    const sourceReturn = vi.fn(async () => ({
      value: undefined,
      done: true as const,
    }));
    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => stalledNext.promise,
          return: sourceReturn,
        };
      },
    };
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: source,
        finish: Promise.reject(
          Object.assign(new Error("provider secret"), {statusCode: 429}),
        ),
      }),
    });

    const result = await runtime.stream(request());
    const finishOutcome = result.finish.catch((error: unknown) => error);
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(sourceReturn).toHaveBeenCalledOnce();
    await expect(finishOutcome).resolves.toEqual(
      new AgentRuntimeError("rate_limited"),
    );
  });

  it("retains exact billing when finish usage resolves before a later stream error", async () => {
    const sourceNext = deferred<IteratorResult<string>>();
    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {next: () => sourceNext.promise};
      },
    };
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: source,
        finish: Promise.resolve(successfulFinish({
          usage: {inputTokens: 1_234, outputTokens: 567},
        })),
      }),
    });

    const result = await runtime.stream(request());
    void result.finish.catch(() => undefined);
    await flushMicrotasks();
    sourceNext.reject(
      Object.assign(new Error("provider secret"), {statusCode: 429}),
    );
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      {
        completedAt: COMPLETED_AT,
        errorCode: "rate_limited",
        inputTokens: 1_234,
        outputTokens: 567,
        costUsd: "0.001401",
      },
    );
  });

  it("fails promptly with zero billing when stream errors before finish is known", async () => {
    const finish = deferred<AgentStreamFinish>();
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: rejectingSource(new Error("provider secret")),
        finish: finish.promise,
      }),
    });

    const result = await runtime.stream(request());
    void result.finish.catch(() => undefined);
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      {
        completedAt: COMPLETED_AT,
        errorCode: "provider_error",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0.000000",
      },
    );
  });

  it("absorbs a late sibling rejection without a duplicate terminal transition", async () => {
    const finish = deferred<AgentStreamFinish>();
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: rejectingSource(new Error("stream failed")),
        finish: finish.promise,
      }),
    });

    const result = await runtime.stream(request());
    void result.finish.catch(() => undefined);
    await flushMicrotasks();
    expect(agentRuns.fail).toHaveBeenCalledOnce();

    finish.reject(Object.assign(new Error("late failure"), {statusCode: 429}));
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.finish).not.toHaveBeenCalled();
    expect(agentRuns.escalate).not.toHaveBeenCalled();
  });
});

describe("re-review: consumer iterator concurrency and cancellation", () => {
  it("rejects a concurrent second next call instead of overwriting the first waiter", async () => {
    const sourceNext = deferred<IteratorResult<string>>();
    const sourceDone = deferred<IteratorResult<string>>();
    const finish = deferred<AgentStreamFinish>();
    let sourceCalls = 0;
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: {
          [Symbol.asyncIterator]() {
            return {
              next() {
                sourceCalls += 1;
                return sourceCalls === 1 ? sourceNext.promise : sourceDone.promise;
              },
            };
          },
        },
        finish: finish.promise,
      }),
    });
    const result = await runtime.stream(request());
    void result.finish.catch(() => undefined);
    const iterator = result.textStream[Symbol.asyncIterator]();
    const first = iterator.next();
    let secondError: unknown;
    void iterator.next().catch((error: unknown) => {
      secondError = error;
    });

    await flushMicrotasks();

    expect(secondError).toEqual(
      new AgentRuntimeError("invalid_provider_response"),
    );
    sourceNext.resolve({value: "first", done: false});
    await expect(first).resolves.toEqual({value: "first", done: false});
    await iterator.return?.();
    sourceDone.resolve({value: undefined, done: true});
    finish.resolve(successfulFinish());
    await expect(result.finish).resolves.toMatchObject({status: "completed"});
  });

  it("consumer return detaches and discards deltas while lifecycle pumping continues", async () => {
    const secondDelta = deferred<IteratorResult<string>>();
    const finish = deferred<AgentStreamFinish>();
    let sourceCalls = 0;
    const sourceReturn = vi.fn(async () => ({
      value: undefined,
      done: true as const,
    }));
    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            sourceCalls += 1;
            if (sourceCalls === 1) {
              return Promise.resolve({value: "first", done: false as const});
            }
            if (sourceCalls === 2) return secondDelta.promise;
            return Promise.resolve({value: undefined, done: true as const});
          },
          return: sourceReturn,
        };
      },
    };
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({textStream: source, finish: finish.promise}),
    });

    const result = await runtime.stream(request());
    const iterator = result.textStream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      value: "first",
      done: false,
    });
    await expect(iterator.return?.()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    secondDelta.resolve({
      value: "x".repeat(MAX_BUFFERED_STREAM_CHARACTERS + 1),
      done: false,
    });
    finish.resolve(successfulFinish());

    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    expect(sourceReturn).not.toHaveBeenCalled();
  });

  it("consumer throw detaches without cancelling the provider iterator", async () => {
    const sourceNext = deferred<IteratorResult<string>>();
    const finish = deferred<AgentStreamFinish>();
    const sourceReturn = vi.fn(async () => ({
      value: undefined,
      done: true as const,
    }));
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: {
          [Symbol.asyncIterator]() {
            return {
              next: () => sourceNext.promise,
              return: sourceReturn,
            };
          },
        },
        finish: finish.promise,
      }),
    });

    const result = await runtime.stream(request());
    const iterator = result.textStream[Symbol.asyncIterator]();
    const consumerError = new Error("consumer stopped");

    expect(iterator.throw).toBeTypeOf("function");
    await expect(iterator.throw?.(consumerError)).rejects.toBe(consumerError);
    sourceNext.resolve({value: undefined, done: true});
    finish.resolve(successfulFinish());

    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    expect(sourceReturn).not.toHaveBeenCalled();
  });
});

describe("re-review: provider and model provenance", () => {
  it("persists a valid model before provider construction even when construction fails", async () => {
    const order: string[] = [];
    const agentRuns = createAgentRunsFake();
    agentRuns.start.mockImplementation(async () => {
      order.push("start");
      return {id: RUN_ID};
    });
    agentRuns.configureModel.mockImplementation(async () => {
      order.push("configure");
      return {id: RUN_ID};
    });
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => {
          order.push("factory");
          throw new Error("provider secret");
        },
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    await expect(runtime.stream(request())).rejects.toEqual(
      new AgentRuntimeError("provider_error"),
    );

    expect(order).toEqual(["start", "configure", "factory"]);
    expect(agentRuns.configureModel).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {provider: "openai", model: "gpt-4.1-mini"},
    );
  });

  it.each([
    ["disabled", {enabled: false, model: ""}],
    ["malformed", {model: "not-a-model"}],
  ])("keeps provenance null for a %s turn", async (_label, overrides) => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: vi.fn(),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    if ("enabled" in overrides && overrides.enabled === false) {
      const result = await runtime.stream(request(overrides));
      await result.finish;
    } else {
      await expect(runtime.stream(request(overrides))).rejects.toEqual(
        new AgentRuntimeError("configuration_error"),
      );
    }

    expect(agentRuns.configureModel).not.toHaveBeenCalled();
  });
});
