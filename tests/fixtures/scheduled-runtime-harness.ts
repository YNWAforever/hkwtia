import {vi} from "vitest";

import {AgentRuntimeError} from "@/lib/ai/runtime";
import type {AgentConfig} from "@/lib/ai/scheduled-runtime";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";

function text(value: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

export function scheduledRuntimeHarness(
  json: string,
  actor: ScheduledAgentActor,
) {
  const finish = {
    status: "completed" as const,
    runId: actor.runId,
    usage: {inputTokens: 5, outputTokens: 3},
    costUsd: "0.000001",
    finishReason: "stop",
    steps: 1,
    citations: [],
  };
  const finalize = vi.fn(async () => finish);
  const fail = vi.fn(async (error?: unknown) => (
    error instanceof AgentRuntimeError
      ? error
      : new AgentRuntimeError("tool_error")
  ));
  const runtime = {
    adoptPrestarted: vi.fn(() => ({
      runId: actor.runId,
      fail,
    })),
    stream: vi.fn(async () => ({
      runId: actor.runId,
      textStream: text(json),
      finish: Promise.resolve(finish),
      finalize,
      fail,
    })),
  };
  const agentConfig = {
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "test"},
    system: "Return one strict JSON object.",
    runtime,
  } as unknown as AgentConfig;

  return {agentConfig, finalize, fail};
}
