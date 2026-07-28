import {z} from "zod";
import {describe, expect, it, vi} from "vitest";

import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {AgentRuntimeError} from "@/lib/ai/runtime";
import {runScheduledJson} from "@/lib/ai/scheduled-runtime";

const actor: ScheduledAgentActor = {
  kind: "agent",
  agent: "retention_analyst",
  runId: "33333333-3333-4333-8333-333333333333",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};

function text(...deltas: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) yield delta;
    },
  };
}

function completedFinish(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed" as const,
    runId: actor.runId,
    usage: {inputTokens: 5, outputTokens: 3},
    costUsd: "0.000001",
    finishReason: "stop",
    steps: 1,
    citations: [],
    ...overrides,
  };
}

function harness(options: {
  deltas?: string[];
  finish?: Promise<ReturnType<typeof completedFinish>>;
  streamError?: unknown;
} = {}) {
  const finalize = vi.fn(async () => completedFinish());
  const fail = vi.fn(async (error?: unknown) => (
    error instanceof AgentRuntimeError
      ? error
      : new AgentRuntimeError("invalid_provider_response")
  ));
  const runtimeStream = {
    runId: actor.runId,
    textStream: options.streamError === undefined
      ? text(...(options.deltas ?? ['{"summary":"ok"}']))
      : {
        async *[Symbol.asyncIterator]() {
          throw options.streamError;
        },
      },
    finish: options.finish ?? Promise.resolve(completedFinish()),
    finalize,
    fail,
  };
  const prepared = {runId: actor.runId, fail};
  const runtime = {
    adoptPrestarted: vi.fn(() => prepared),
    stream: vi.fn(async () => runtimeStream),
  };
  const agentConfig = {
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "test"},
    system: "Return one JSON object and no other output.",
    runtime,
  };
  return {agentConfig, runtime, runtimeStream, finalize, fail};
}

const outputSchema = z.object({summary: z.string()}).strict();

describe("scheduled agent JSON runtime", () => {
  it("drains and concatenates text, validates once, then explicitly finalizes", async () => {
    const {agentConfig, runtime, finalize, fail} = harness({
      deltas: ['{"sum', 'mary":"', 'retained"}'],
    });
    const parse = vi.spyOn(outputSchema, "parse");

    await expect(runScheduledJson({
      actor,
      agentConfig,
      prompt: "Analyze deterministic facts.",
      outputSchema,
    })).resolves.toEqual({summary: "retained"});

    expect(parse).toHaveBeenCalledOnce();
    expect(runtime.adoptPrestarted).toHaveBeenCalledWith({
      agent: actor.agent,
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
    }, actor.runId);
    expect(runtime.stream).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({agent: actor.agent, trigger: "scheduled"}),
      messages: [{role: "user", content: "Analyze deterministic facts."}],
      tools: {},
      preparedRun: expect.anything(),
      finalization: "deferred",
    }));
    expect(finalize).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
  });

  it("fails the same run with sanitized metadata for invalid JSON", async () => {
    const {agentConfig, finalize, fail} = harness({
      deltas: ["not-json containing a provider secret"],
    });

    await expect(runScheduledJson({
      actor,
      agentConfig,
      prompt: "Analyze.",
      outputSchema,
    })).rejects.toMatchObject({
      code: "invalid_provider_response",
      message: "AI_RUNTIME_FAILED:invalid_provider_response",
    });

    expect(fail).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      code: "invalid_provider_response",
    }));
    expect(JSON.stringify(fail.mock.calls)).not.toContain("provider secret");
    expect(finalize).not.toHaveBeenCalled();
  });

  it("enforces strict schema validation and never finalizes a partial value", async () => {
    const {agentConfig, finalize, fail} = harness({
      deltas: ['{"summary":"ok","unexpected":true}'],
    });

    await expect(runScheduledJson({
      actor,
      agentConfig,
      prompt: "Analyze.",
      outputSchema,
    })).rejects.toMatchObject({code: "invalid_provider_response"});
    expect(fail).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("preserves provider and cancellation failure lifecycles without completing", async () => {
    const providerFailure = new AgentRuntimeError("provider_error");
    const provider = harness({finish: Promise.reject(providerFailure)});
    await expect(runScheduledJson({
      actor,
      agentConfig: provider.agentConfig,
      prompt: "Analyze.",
      outputSchema,
    })).rejects.toMatchObject({code: "provider_error"});
    expect(provider.fail).toHaveBeenCalledWith(providerFailure);
    expect(provider.finalize).not.toHaveBeenCalled();

    const abortError = Object.assign(new Error("cancelled"), {name: "AbortError"});
    const cancelled = harness({streamError: abortError});
    cancelled.fail.mockResolvedValueOnce(new AgentRuntimeError("timeout"));
    const controller = new AbortController();
    controller.abort();
    await expect(runScheduledJson({
      actor,
      agentConfig: cancelled.agentConfig,
      prompt: "Analyze.",
      outputSchema,
      signal: controller.signal,
    })).rejects.toMatchObject({code: "timeout"});
    expect(cancelled.runtime.stream).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: controller.signal,
    }));
    expect(cancelled.finalize).not.toHaveBeenCalled();
  });

  it("rejects tool/non-text completion and performs no automatic side effect", async () => {
    const {agentConfig, finalize, fail} = harness({
      finish: Promise.resolve(completedFinish({finishReason: "tool-calls"})),
    });

    await expect(runScheduledJson({
      actor,
      agentConfig,
      prompt: "Analyze.",
      outputSchema,
    })).rejects.toMatchObject({code: "invalid_provider_response"});
    expect(fail).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });
});
