import {describe, expect, it, vi} from "vitest";

import {
  AgentRuntimeError,
  MAX_BUFFERED_STREAM_CHARACTERS,
  createAgentRuntime,
} from "@/lib/ai/runtime";
import {
  AgentToolExecutionError,
  MAX_AGENT_CITATIONS,
  normalizeAgentCitations,
  type AgentProvider,
  type AgentStreamFinish,
  type AgentToolSet,
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

function asyncText(...deltas: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) yield delta;
    },
  };
}

async function collectText(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const delta of stream) text += delta;
  return text;
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
  providerFactories: Parameters<typeof createAgentRuntime>[0]["providerFactories"],
  now = vi.fn()
    .mockReturnValueOnce(STARTED_AT)
    .mockReturnValue(COMPLETED_AT),
) {
  return createAgentRuntime({
    agentRuns,
    providerFactories,
    createRunId: () => RUN_ID,
    now,
  });
}

describe("review hardening: start-first lifecycle", () => {
  it.each([
    ["missing colon", "gpt-4.1-mini"],
    ["empty model", ""],
    ["unknown provider", "google:gemini-pro"],
    ["unknown model", "openai:gpt-unknown"],
  ])("persists %s as one stable configuration failure", async (_label, model) => {
    const agentRuns = createAgentRunsFake();
    const openaiFactory = vi.fn();
    const anthropicFactory = vi.fn();
    const toolExecute = vi.fn();
    const runtime = createRuntime(agentRuns, {
      openai: openaiFactory,
      anthropic: anthropicFactory,
    });

    await expect(runtime.stream(request({
      model,
      tools: {
        forbidden: {
          description: "must not execute",
          inputSchema: {parse: vi.fn()} as never,
          strict: true,
          execute: toolExecute,
        },
      },
    }))).rejects.toEqual(new AgentRuntimeError("configuration_error"));

    expect(agentRuns.start).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {provider: null, model: null, startedAt: STARTED_AT},
    );
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {
        completedAt: COMPLETED_AT,
        errorCode: "configuration_error",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0.000000",
      },
    );
    expect(openaiFactory).not.toHaveBeenCalled();
    expect(anthropicFactory).not.toHaveBeenCalled();
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it("starts and disables without parsing malformed model configuration", async () => {
    const agentRuns = createAgentRunsFake();
    const openaiFactory = vi.fn();
    const anthropicFactory = vi.fn();
    const toolExecute = vi.fn();
    const runtime = createRuntime(agentRuns, {
      openai: openaiFactory,
      anthropic: anthropicFactory,
    });

    const result = await runtime.stream(request({
      enabled: false,
      model: "",
      tools: {
        forbidden: {
          description: "must not execute",
          inputSchema: {parse: vi.fn()} as never,
          strict: true,
          execute: toolExecute,
        },
      },
    }));

    await expect(result.finish).resolves.toMatchObject({
      status: "disabled",
      code: "agent_disabled",
    });
    expect(agentRuns.start).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {provider: null, model: null, startedAt: STARTED_AT},
    );
    expect(agentRuns.disable).toHaveBeenCalledOnce();
    expect(agentRuns.fail).not.toHaveBeenCalled();
    expect(openaiFactory).not.toHaveBeenCalled();
    expect(anthropicFactory).not.toHaveBeenCalled();
    expect(toolExecute).not.toHaveBeenCalled();
  });
});

describe("review hardening: setup rejection classification", () => {
  it.each([
    [
      "tool error",
      "tool_error",
      () => ({error: new AgentToolExecutionError(), signal: undefined}),
    ],
    [
      "rate limit",
      "rate_limited",
      () => ({
        error: Object.assign(new Error("provider secret"), {statusCode: 429}),
        signal: undefined,
      }),
    ],
    [
      "timeout",
      "timeout",
      () => ({
        error: Object.assign(new Error("provider secret"), {name: "TimeoutError"}),
        signal: undefined,
      }),
    ],
    [
      "abort",
      "timeout",
      () => {
        const controller = new AbortController();
        controller.abort();
        return {error: new Error("provider secret"), signal: controller.signal};
      },
    ],
    [
      "configuration",
      "configuration_error",
      () => ({
        error: new AgentRuntimeError("configuration_error"),
        signal: undefined,
      }),
    ],
  ])("maps early async %s rejection to %s", async (_label, code, setup) => {
    const {error, signal} = setup();
    const agentRuns = createAgentRunsFake();
    const provider: AgentProvider = {
      stream: vi.fn(async () => {
        throw error;
      }),
    };
    const runtime = createRuntime(agentRuns, {
      openai: () => provider,
      anthropic: vi.fn(),
    });

    await expect(runtime.stream(request({
      ...(signal === undefined ? {} : {abortSignal: signal}),
    }))).rejects.toMatchObject({
      code,
      message: `AI_RUNTIME_FAILED:${code}`,
    });
    expect(agentRuns.start).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({errorCode: code}),
    );
    expect(JSON.stringify(agentRuns.fail.mock.calls)).not.toContain(
      "provider secret",
    );
  });
});

describe("review hardening: failure usage accounting", () => {
  it("persists billable aggregate usage and cost for an error finish", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: asyncText(),
          finish: Promise.resolve(successfulFinish({
            finishReason: "error",
            usage: {inputTokens: 1_234, outputTokens: 567},
          })),
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());

    await expect(result.finish).rejects.toEqual(
      new AgentRuntimeError("provider_error"),
    );
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {
        completedAt: COMPLETED_AT,
        errorCode: "provider_error",
        inputTokens: 1_234,
        outputTokens: 567,
        costUsd: "0.001401",
      },
    );
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });
});

describe("review hardening: background stream pump", () => {
  it("fails once when finish resolves before a partial stream later errors", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield "partial";
              throw Object.assign(new Error("provider secret"), {statusCode: 429});
            },
          },
          finish: Promise.resolve(successfulFinish()),
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());

    await expect(collectText(result.textStream)).rejects.toEqual(
      new AgentRuntimeError("rate_limited"),
    );
    await expect(result.finish).rejects.toEqual(
      new AgentRuntimeError("rate_limited"),
    );
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });

  it("streams completed output before a later provider finish rejection", async () => {
    const finish = deferred<AgentStreamFinish>();
    const streamCompleted = deferred<void>();
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield "early";
              streamCompleted.resolve();
            },
          },
          finish: finish.promise,
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());
    await streamCompleted.promise;
    finish.reject(Object.assign(new Error("provider secret"), {statusCode: 429}));

    await expect(collectText(result.textStream)).resolves.toBe("early");
    await expect(result.finish).rejects.toEqual(
      new AgentRuntimeError("rate_limited"),
    );
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });

  it("delivers all pumped deltas to a draining caller before successful settlement", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: asyncText("one", " two", " three"),
          finish: Promise.resolve(successfulFinish()),
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());

    await expect(collectText(result.textStream)).resolves.toBe("one two three");
    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    expect(agentRuns.finish).toHaveBeenCalledOnce();
    expect(agentRuns.fail).not.toHaveBeenCalled();
  });

  it("pumps and persists successfully when the caller never drains", async () => {
    let pumpCompleted = false;
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield "background";
              pumpCompleted = true;
            },
          },
          finish: Promise.resolve(successfulFinish()),
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());

    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    expect(pumpCompleted).toBe(true);
    expect(agentRuns.finish).toHaveBeenCalledOnce();
    expect(agentRuns.fail).not.toHaveBeenCalled();
  });

  it("fails safely when an undrained stream exceeds the bounded queue", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createRuntime(agentRuns, {
      openai: () => ({
        stream: () => ({
          textStream: asyncText(
            "x".repeat(MAX_BUFFERED_STREAM_CHARACTERS + 1),
          ),
          finish: Promise.resolve(successfulFinish()),
        }),
      }),
      anthropic: vi.fn(),
    });

    const result = await runtime.stream(request());

    await expect(result.finish).rejects.toEqual(
      new AgentRuntimeError("invalid_provider_response"),
    );
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({errorCode: "invalid_provider_response"}),
    );
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });
});

describe("review hardening: citation allocation bounds", () => {
  it.each([
    ["string", "https://attacker.test"],
    ["object", {sourceId: "unsafe", title: "Unsafe"}],
    ["null", null],
  ])("ignores a non-array citation %s", (_label, citations) => {
    expect(normalizeAgentCitations(citations)).toEqual([]);
  });

  it("inspects at most the citation cap even for an adversarial huge array", () => {
    const sparse: unknown[] = [];
    sparse.length = 1_000_000;
    for (let index = 0; index < MAX_AGENT_CITATIONS; index += 1) {
      sparse[index] = {
        sourceId: `source-${index}`,
        title: `Source ${index}`,
        url: `https://example.test/${index}`,
      };
    }
    let indexedReads = 0;
    const citations = new Proxy(sparse, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          indexedReads += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(normalizeAgentCitations(citations)).toHaveLength(MAX_AGENT_CITATIONS);
    expect(indexedReads).toBeLessThanOrEqual(MAX_AGENT_CITATIONS);
  });
});
