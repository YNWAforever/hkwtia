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

function successfulFinish(): AgentStreamFinish {
  return {
    usage: {inputTokens: 1_000, outputTokens: 500},
    finishReason: "stop",
    steps: 2,
    toolExecutions: 0,
    citations: [],
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

function request() {
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

describe("final re-review: provider source cleanup", () => {
  it("closes the source exactly once after a source iterator error", async () => {
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
              next: async () => {
                throw Object.assign(
                  new Error("provider secret"),
                  {statusCode: 429},
                );
              },
              return: sourceReturn,
            };
          },
        },
        finish: finish.promise,
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

  it("closes the source exactly once after bounded queue overflow", async () => {
    const finish = deferred<AgentStreamFinish>();
    const sourceReturn = vi.fn(async () => ({
      value: undefined,
      done: true as const,
    }));
    let sourceCalls = 0;
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                sourceCalls += 1;
                return sourceCalls === 1
                  ? {
                    value: "x".repeat(
                      MAX_BUFFERED_STREAM_CHARACTERS + 1,
                    ),
                    done: false as const,
                  }
                  : {value: undefined, done: true as const};
              },
              return: sourceReturn,
            };
          },
        },
        finish: finish.promise,
      }),
    });

    const result = await runtime.stream(request());
    const finishOutcome = result.finish.catch((error: unknown) => error);
    await flushMicrotasks();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(sourceReturn).toHaveBeenCalledOnce();
    await expect(finishOutcome).resolves.toEqual(
      new AgentRuntimeError("invalid_provider_response"),
    );
  });

  it("absorbs a synchronous source return throw and still fails once", async () => {
    const stalledNext = deferred<IteratorResult<string>>();
    const cleanupError = new Error("cleanup secret");
    const sourceReturn = vi.fn((): Promise<IteratorResult<string>> => {
      throw cleanupError;
    });
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      stream: () => ({
        textStream: {
          [Symbol.asyncIterator]() {
            return {
              next: () => stalledNext.promise,
              return: sourceReturn,
            };
          },
        },
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
    stalledNext.reject(new Error("late source failure"));
    await flushMicrotasks();
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(sourceReturn).toHaveBeenCalledOnce();
  });

  it("absorbs an asynchronous source return rejection without an unhandled error", async () => {
    const stalledNext = deferred<IteratorResult<string>>();
    const cleanupError = new Error("cleanup secret");
    const sourceReturn = vi.fn(() => Promise.reject(cleanupError));
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const agentRuns = createAgentRunsFake();
      const runtime = createRuntime(agentRuns, {
        stream: () => ({
          textStream: {
            [Symbol.asyncIterator]() {
              return {
                next: () => stalledNext.promise,
                return: sourceReturn,
              };
            },
          },
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
      stalledNext.reject(new Error("late source failure"));
      await flushMicrotasks();
      expect(agentRuns.fail).toHaveBeenCalledOnce();
      expect(sourceReturn).toHaveBeenCalledOnce();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("does not close a normally completed source", async () => {
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
              next: async () => ({value: undefined, done: true as const}),
              return: sourceReturn,
            };
          },
        },
        finish: Promise.resolve(successfulFinish()),
      }),
    });

    const result = await runtime.stream(request());

    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    expect(sourceReturn).not.toHaveBeenCalled();
  });
});
