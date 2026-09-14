import {z} from "zod";
import {describe, expect, it, vi} from "vitest";

import type {WriterAgentActor} from "@/lib/auth/agent-actor";
import {AgentRuntimeError} from "@/lib/ai/runtime";
import {
  generateWriterCopy,
  runWriterJson,
  type WriterAgentConfig,
  type WriterDependencies,
} from "@/lib/ai/writers/generate";
import {writerSystemPrompt} from "@/config/agents/writer";

const actor: WriterAgentActor = {
  kind: "agent",
  agent: "writer",
  runId: "44444444-4444-4444-8444-444444444444",
  conversationId: null,
  profileId: "profile-1",
  trigger: "portal",
};

function text(...deltas: string[]): AsyncIterable<string> {
  return {async *[Symbol.asyncIterator]() { for (const delta of deltas) yield delta; }};
}

function completedFinish(overrides: Record<string, unknown> = {}) {
  return {status: "completed" as const, runId: actor.runId, usage: {inputTokens: 5, outputTokens: 3}, costUsd: "0.000001", finishReason: "stop", steps: 1, citations: [], ...overrides};
}

function harness(options: {deltas?: string[]; finish?: Record<string, unknown>} = {}) {
  const finalize = vi.fn(async () => completedFinish());
  const fail = vi.fn(async (error?: unknown) => (error instanceof AgentRuntimeError ? error : new AgentRuntimeError("invalid_provider_response")));
  const runtimeStream = {
    runId: actor.runId,
    textStream: text(...(options.deltas ?? ['{"ok":true}'])),
    finish: Promise.resolve(completedFinish(options.finish)),
    finalize,
    fail,
  };
  const prepared = {runId: actor.runId, fail};
  const adoptPrestarted = vi.fn(() => prepared);
  const runtime = {adoptPrestarted, stream: vi.fn(async () => runtimeStream)};
  const agentConfig: WriterAgentConfig = {enabled: true, model: "openai:gpt-4.1-mini", credentials: {openaiApiKey: "test"}, system: "sys", runtime};
  return {agentConfig, adoptPrestarted, runtimeStream, finalize, fail};
}

const okSchema = z.object({ok: z.boolean()}).strict();

describe("runWriterJson", () => {
  it("returns the parsed JSON and adopts the writer run", async () => {
    const {agentConfig, adoptPrestarted} = harness({deltas: ['{"ok":', "true}"]});
    await expect(runWriterJson({actor, agentConfig, prompt: "brief", outputSchema: okSchema})).resolves.toEqual({ok: true});
    expect(adoptPrestarted).toHaveBeenCalledWith(
      {agent: "writer", conversationId: null, profileId: "profile-1", trigger: "portal"},
      actor.runId,
    );
  });

  it.each([
    ["a citation", {citations: [{sourceId: "s", title: "t"}]}],
    ["a tool call", {finishReason: "tool-calls"}],
    ["a non-completed finish", {status: "disabled"}],
  ])("rejects %s", async (_case, finish) => {
    const {agentConfig} = harness({deltas: ['{"ok":true}'], finish});
    await expect(runWriterJson({actor, agentConfig, prompt: "brief", outputSchema: okSchema})).rejects.toBeInstanceOf(AgentRuntimeError);
  });

  it.each([
    ["invalid JSON", ["not json"]],
    ["a field the schema refuses", ['{"ok":"yes"}']],
  ])("rejects %s", async (_case, deltas) => {
    const {agentConfig} = harness({deltas});
    await expect(runWriterJson({actor, agentConfig, prompt: "brief", outputSchema: okSchema})).rejects.toBeInstanceOf(AgentRuntimeError);
  });
});

describe("generateWriterCopy", () => {
  const memberActor = {
    kind: "member" as const,
    userId: "user-1",
    profileId: "profile-1",
  };

  it("starts the run row before streaming and returns the parsed copy", async () => {
    const order: string[] = [];
    const finalize = vi.fn(async () => completedFinish());
    const fail = vi.fn(async (error?: unknown) => (error instanceof AgentRuntimeError ? error : new AgentRuntimeError("invalid_provider_response")));
    const runtimeStream = {
      runId: actor.runId,
      textStream: text('{"descriptionEn":"Launch copy","descriptionZh":"\u555f\u52d5\u6587\u6848"}'),
      finish: Promise.resolve(completedFinish()),
      finalize,
      fail,
    };
    const adoptPrestarted = vi.fn(() => ({runId: actor.runId, fail}));
    const stream = vi.fn(async () => {
      order.push("stream");
      return runtimeStream;
    });
    const start = vi.fn(async () => {
      order.push("start");
    });
    const dependencies: Partial<WriterDependencies> = {
      agentRuns: {start} as unknown as WriterDependencies["agentRuns"],
      runtime: {adoptPrestarted, stream},
      credentials: {openaiApiKey: "test"},
      enabled: true,
      model: "openai:gpt-4.1-mini",
      createRunId: () => actor.runId,
    };

    await expect(generateWriterCopy({
      memberActor,
      kind: "event",
      brief: "Launch copy",
      dependencies,
    })).resolves.toEqual({descriptionEn: "Launch copy", descriptionZh: "\u555f\u52d5\u6587\u6848"});

    expect(order).toEqual(["start", "stream"]);
    expect(start).toHaveBeenCalledWith(
      {
        kind: "agent",
        agent: "writer",
        runId: actor.runId,
        conversationId: null,
        profileId: "profile-1",
        trigger: "portal",
      },
      {provider: null, model: null},
    );
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      system: writerSystemPrompt("event"),
      tools: {},
    }));
  });
});
