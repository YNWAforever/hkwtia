import type {LanguageModel} from "ai";
import {z} from "zod";
import {describe, expect, it, vi} from "vitest";

import {
  AgentRuntimeError,
  createAgentRuntime,
} from "@/lib/ai/runtime";
import {
  MAX_AGENT_STEPS,
  type AgentProvider,
  type AgentStreamFinish,
  type AgentToolSet,
} from "@/lib/ai/provider";
import {createOpenAIAgentProvider} from "@/lib/ai/providers/openai";

const RUN_ID = "019f6bb0-f721-7eb8-9a6b-112233445566";
const STARTED_AT = new Date("2026-07-27T01:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-27T01:00:01.000Z");

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

function runtimeRequest(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "openai-test-key"},
    actor: {
      conversationId: "conversation-1",
      profileId: "profile-1",
      trigger: "web" as const,
    },
    system: "Answer with grounded facts.",
    messages: [{role: "user" as const, content: "What is WTIA?"}],
    tools: {} satisfies AgentToolSet,
    ...overrides,
  };
}

describe("provider-neutral AI runtime", () => {
  it("supports a precreated run with explicit deferred finalization", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText("durable answer"),
            finish: Promise.resolve(successfulFinish()),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const prepared = await runtime.prepare(runtimeRequest().actor);
    const result = await runtime.stream(runtimeRequest({
      preparedRun: prepared,
      finalization: "deferred",
    }));

    await expect(result.finish).resolves.toMatchObject({
      status: "completed",
      runId: RUN_ID,
    });
    expect(agentRuns.start).toHaveBeenCalledOnce();
    expect(agentRuns.finish).not.toHaveBeenCalled();

    await expect(result.finalize()).resolves.toMatchObject({
      status: "completed",
      runId: RUN_ID,
    });
    expect(agentRuns.finish).toHaveBeenCalledOnce();
  });

  it("preserves a scheduled agent identity through the full run lifecycle", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText('{"summary":"ok"}'),
            finish: Promise.resolve(successfulFinish()),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });
    const scheduledActor = {
      agent: "retention_analyst" as const,
      conversationId: null,
      profileId: null,
      trigger: "scheduled" as const,
    };

    const prepared = await runtime.prepare(scheduledActor);
    const result = await runtime.stream({
      ...runtimeRequest(),
      actor: scheduledActor,
      preparedRun: prepared,
      finalization: "deferred",
    });
    await collectText(result.textStream);
    await result.finalize();

    for (const lifecycle of [
      agentRuns.start,
      agentRuns.configureModel,
      agentRuns.finish,
    ]) {
      expect(lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "agent",
          agent: "retention_analyst",
          runId: RUN_ID,
          conversationId: null,
          profileId: null,
          trigger: "scheduled",
        }),
        expect.anything(),
      );
    }
    expect(agentRuns.fail).not.toHaveBeenCalled();
  });

  it("starts the run before provider construction, streams deltas, and records usage cost", async () => {
    const order: string[] = [];
    const agentRuns = createAgentRunsFake();
    agentRuns.start.mockImplementation(async () => {
      order.push("start");
      return {id: RUN_ID};
    });
    const provider: AgentProvider = {
      stream: vi.fn(() => {
        order.push("stream");
        return {
          textStream: asyncText("Hello", " world"),
          finish: Promise.resolve(successfulFinish()),
        };
      }),
    };
    const openaiFactory = vi.fn(() => {
      order.push("factory");
      return provider;
    });
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {openai: openaiFactory, anthropic: vi.fn()},
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const result = await runtime.stream(runtimeRequest());

    await expect(collectText(result.textStream)).resolves.toBe("Hello world");
    await expect(result.finish).resolves.toMatchObject({
      status: "completed",
      runId: RUN_ID,
      usage: {inputTokens: 1_000, outputTokens: 500},
      costUsd: "0.001200",
      steps: 2,
    });
    expect(order).toEqual(["start", "factory", "stream"]);
    expect(agentRuns.start).toHaveBeenCalledWith({
      kind: "agent",
      agent: "concierge",
      runId: RUN_ID,
      conversationId: "conversation-1",
      profileId: "profile-1",
      trigger: "web",
    }, {
      provider: null,
      model: null,
      startedAt: STARTED_AT,
    });
    expect(agentRuns.finish).toHaveBeenCalledOnce();
    expect(agentRuns.finish).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {
        completedAt: COMPLETED_AT,
        summaryCode: "answered",
        inputTokens: 1_000,
        outputTokens: 500,
        costUsd: "0.001200",
      },
    );
  });

  it("normalizes citations while inspecting at most the configured input cap", async () => {
    const citations = Array.from({length: 12}, (_, index) => ({
      sourceId: `source-${index}`,
      title: `Source ${index}`,
      url: `https://example.test/source-${index}`,
    }));
    citations.splice(1, 0, {
      sourceId: "source-0",
      title: "Duplicate source",
      url: "https://attacker.test/duplicate",
    });
    citations.splice(2, 0, {
      sourceId: "unsafe",
      title: "Unsafe protocol",
      url: "javascript:alert(1)",
    });
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText("Grounded answer"),
            finish: Promise.resolve(successfulFinish({citations})),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const result = await runtime.stream(runtimeRequest());
    const finish = await result.finish;

    expect(finish.citations).toHaveLength(6);
    expect(finish.citations[0]).toEqual({
      sourceId: "source-0",
      title: "Source 0",
      url: "https://example.test/source-0",
    });
    expect(finish.citations).not.toContainEqual(
      expect.objectContaining({sourceId: "unsafe"}),
    );
    expect(finish.citations).not.toContainEqual(
      expect.objectContaining({sourceId: "source-6"}),
    );
  });

  it("records a disabled terminal run with zero provider, model, stream, and tool calls", async () => {
    const agentRuns = createAgentRunsFake();
    const openaiFactory = vi.fn();
    const anthropicFactory = vi.fn();
    const toolExecute = vi.fn();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: openaiFactory,
        anthropic: anthropicFactory,
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const result = await runtime.stream(runtimeRequest({
      enabled: false,
      tools: {
        shouldNeverRun: {
          description: "Must remain disabled",
          inputSchema: z.object({}),
          strict: true,
          execute: toolExecute,
        },
      },
    }));

    await expect(collectText(result.textStream)).resolves.toBe("");
    await expect(result.finish).resolves.toMatchObject({
      status: "disabled",
      code: "agent_disabled",
      usage: {inputTokens: 0, outputTokens: 0},
      costUsd: "0.000000",
    });
    expect(agentRuns.start).toHaveBeenCalledOnce();
    expect(agentRuns.disable).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {
        completedAt: COMPLETED_AT,
        summaryCode: "agent_disabled",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0.000000",
      },
    );
    expect(openaiFactory).not.toHaveBeenCalled();
    expect(anthropicFactory).not.toHaveBeenCalled();
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it("starts then reports a stable configuration error when the selected key is missing", async () => {
    const agentRuns = createAgentRunsFake();
    const openaiFactory = vi.fn();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {openai: openaiFactory, anthropic: vi.fn()},
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    await expect(runtime.stream(runtimeRequest({credentials: {}}))).rejects.toMatchObject({
      code: "configuration_error",
      message: "AI_RUNTIME_FAILED:configuration_error",
    });
    expect(agentRuns.start).toHaveBeenCalledOnce();
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
  });

  it("rejects unknown models after start and before provider construction", async () => {
    const agentRuns = createAgentRunsFake();
    const openaiFactory = vi.fn();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {openai: openaiFactory, anthropic: vi.fn()},
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    await expect(runtime.stream(runtimeRequest({
      model: "openai:gpt-unknown",
    }))).rejects.toBeInstanceOf(AgentRuntimeError);
    expect(agentRuns.start).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({errorCode: "configuration_error"}),
    );
    expect(openaiFactory).not.toHaveBeenCalled();
  });

  it("defends the provider-neutral boundary against more than eight reported steps", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText("invalid"),
            finish: Promise.resolve(successfulFinish({steps: MAX_AGENT_STEPS + 1})),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const result = await runtime.stream(runtimeRequest());

    await expect(result.finish).rejects.toMatchObject({
      code: "invalid_provider_response",
      message: "AI_RUNTIME_FAILED:invalid_provider_response",
    });
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({errorCode: "invalid_provider_response"}),
    );
  });

  it("escalates an exhausted eight-step tool loop with a repository-safe code", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText(),
            finish: Promise.resolve(successfulFinish({
              finishReason: "tool-calls",
              steps: MAX_AGENT_STEPS,
              toolExecutions: MAX_AGENT_STEPS,
            })),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    const result = await runtime.stream(runtimeRequest());

    await expect(result.finish).resolves.toMatchObject({
      status: "escalated",
      code: "tool_unavailable",
      usage: {inputTokens: 1_000, outputTokens: 500},
      costUsd: "0.001200",
      steps: MAX_AGENT_STEPS,
    });
    expect(agentRuns.escalate).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      {
        completedAt: COMPLETED_AT,
        summaryCode: "tool_unavailable",
        inputTokens: 1_000,
        outputTokens: 500,
        costUsd: "0.001200",
      },
    );
    expect(agentRuns.finish).not.toHaveBeenCalled();
    expect(agentRuns.fail).not.toHaveBeenCalled();
  });

  it("maps rate limits without exposing provider messages and finalizes exactly once", async () => {
    const agentRuns = createAgentRunsFake();
    const providerFailure = Object.assign(
      new Error("secret provider response body"),
      {statusCode: 429},
    );
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText(),
            finish: Promise.reject(providerFailure),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });
    const result = await runtime.stream(runtimeRequest());

    await expect(result.finish).rejects.toMatchObject({
      code: "rate_limited",
      message: "AI_RUNTIME_FAILED:rate_limited",
    });
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(JSON.stringify(agentRuns.fail.mock.calls)).not.toContain(
      "secret provider response body",
    );
  });

  it("maps a provider error finish reason to a stable failed lifecycle", async () => {
    const agentRuns = createAgentRunsFake();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: asyncText(),
            finish: Promise.resolve(successfulFinish({finishReason: "error"})),
          }),
        }),
        anthropic: vi.fn(),
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });
    const result = await runtime.stream(runtimeRequest());

    await expect(result.finish).rejects.toMatchObject({
      code: "provider_error",
      message: "AI_RUNTIME_FAILED:provider_error",
    });
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({errorCode: "provider_error"}),
    );
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });

  it("never retries another provider after a tool result", async () => {
    const agentRuns = createAgentRunsFake();
    const toolExecute = vi.fn(async () => ({value: {found: true}, citations: []}));
    const openaiStream = vi.fn(async (request) => {
      await request.tools.lookup.execute(
        {query: "WTIA"},
        {abortSignal: request.abortSignal},
      );
      throw new Error("provider failed after tool execution");
    });
    const openaiFactory = vi.fn(() => ({stream: openaiStream}));
    const anthropicFactory = vi.fn();
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: openaiFactory,
        anthropic: anthropicFactory,
      },
      createRunId: () => RUN_ID,
      now: vi.fn()
        .mockReturnValueOnce(STARTED_AT)
        .mockReturnValue(COMPLETED_AT),
    });

    await expect(runtime.stream(runtimeRequest({
      credentials: {
        openaiApiKey: "openai-test-key",
        anthropicApiKey: "anthropic-test-key",
      },
      tools: {
        lookup: {
          description: "Lookup one source",
          inputSchema: z.object({query: z.string()}),
          strict: true,
          execute: toolExecute,
        },
      },
    }))).rejects.toMatchObject({
      code: "provider_error",
      toolExecutions: 1,
    });
    expect(toolExecute).toHaveBeenCalledOnce();
    expect(openaiFactory).toHaveBeenCalledOnce();
    expect(openaiStream).toHaveBeenCalledOnce();
    expect(anthropicFactory).not.toHaveBeenCalled();
    expect(agentRuns.fail).toHaveBeenCalledOnce();
  });
});

describe("OpenAI AI SDK v7 adapter", () => {
  it("uses explicit credentials, strict SDK tools, zero retries, and the exact eight-step condition", async () => {
    let resolveSteps: (steps: unknown[]) => void = () => undefined;
    const steps = new Promise<unknown[]>((resolve) => {
      resolveSteps = resolve;
    });
    let sdkOptions: Record<string, unknown> | undefined;
    const sdkResult = {
      textStream: asyncText("delta"),
      usage: Promise.resolve({inputTokens: 20, outputTokens: 10}),
      finishReason: Promise.resolve("stop"),
      steps,
    };
    const streamText = vi.fn((options: Record<string, unknown>) => {
      sdkOptions = options;
      return sdkResult;
    });
    const model = {
      provider: "openai",
      modelId: "gpt-4.1-mini",
    } as LanguageModel;
    const modelFactory = vi.fn((modelId: string) => {
      expect(modelId).toBe("gpt-4.1-mini");
      return model;
    });
    const createProvider = vi.fn(({apiKey}: {apiKey?: string}) => {
      expect(apiKey).toBe("explicit-openai-key");
      return modelFactory;
    });
    const execute = vi.fn(async () => ({
      value: {answer: "grounded"},
      citations: [{
        sourceId: "kb-1",
        title: "WTIA source",
        url: "https://example.test/wtia",
      }],
    }));
    const inputSchema = z.object({query: z.string()});
    const provider = createOpenAIAgentProvider("explicit-openai-key", {
      createProvider,
      streamText,
    });

    const result = await provider.stream({
      model: "gpt-4.1-mini",
      system: "System",
      messages: [{role: "user", content: "Question"}],
      tools: {
        lookup: {
          description: "Lookup WTIA knowledge",
          inputSchema,
          strict: true,
          execute,
        },
      },
    });

    expect(modelFactory).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(streamText).toHaveBeenCalledOnce();
    expect(sdkOptions).toMatchObject({
      model,
      system: "System",
      messages: [{role: "user", content: "Question"}],
      maxRetries: 0,
    });
    const stopWhen = sdkOptions?.stopWhen as (input: {steps: unknown[]}) => boolean;
    expect(stopWhen({steps: Array.from({length: 7})})).toBe(false);
    expect(stopWhen({steps: Array.from({length: 8})})).toBe(true);
    const sdkTool = (sdkOptions?.tools as Record<string, {
      strict: boolean;
      inputSchema: unknown;
      execute: (input: unknown, options: unknown) => Promise<unknown>;
    }>).lookup;
    expect(sdkTool.strict).toBe(true);
    expect(sdkTool.inputSchema).toBe(inputSchema);
    await expect(sdkTool.execute(
      {query: "WTIA"},
      {toolCallId: "tool-1", messages: [], context: {}},
    )).resolves.toEqual({answer: "grounded"});
    resolveSteps([{}, {}]);
    await expect(result.finish).resolves.toEqual({
      usage: {inputTokens: 20, outputTokens: 10},
      finishReason: "stop",
      steps: 2,
      toolExecutions: 1,
      citations: [{
        sourceId: "kb-1",
        title: "WTIA source",
        url: "https://example.test/wtia",
      }],
    });
  });
});
