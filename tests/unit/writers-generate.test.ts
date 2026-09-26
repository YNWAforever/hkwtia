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
import {WRITER_KINDS, type WriterOutput} from "@/lib/ai/writers/contracts";
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

function writerHarness(deltas: string[]) {
  const finalize = vi.fn(async () => completedFinish());
  const fail = vi.fn(async (error?: unknown) => (error instanceof AgentRuntimeError ? error : new AgentRuntimeError("invalid_provider_response")));
  const runtimeStream = {
    runId: actor.runId,
    textStream: text(...deltas),
    finish: Promise.resolve(completedFinish()),
    finalize,
    fail,
  };
  const adoptPrestarted = vi.fn(() => ({runId: actor.runId, fail}));
  const stream = vi.fn(async () => runtimeStream);
  const dependencies: Partial<WriterDependencies> = {
    runtime: {adoptPrestarted, stream},
    credentials: {openaiApiKey: "test"},
    enabled: true,
    model: "openai:gpt-4.1-mini",
  };
  return {dependencies, adoptPrestarted, runtimeStream, finalize, fail, stream};
}

const writerOutputs = {
  profile: {
    taglineEn: "Profile tagline",
    taglineZhHk: "\u7c21\u4ecb",
    description: "Profile description",
    descriptionZhHk: "\u63cf\u8ff0",
  },
  listing: {
    taglineEn: "Listing tagline",
    taglineZhHk: "\u5217\u8868",
    descriptionEn: "Listing description",
    descriptionZhHk: "\u63cf\u8ff0",
  },
  event: {
    descriptionEn: "Event description",
    descriptionZh: "\u6d3b\u52d5\u63cf\u8ff0",
  },
} satisfies WriterOutput;

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
    const {agentConfig, finalize, fail} = harness({deltas: ['{"ok":true}'], finish});
    const run = runWriterJson({actor, agentConfig, prompt: "brief", outputSchema: okSchema});
    await expect(run).rejects.toBeInstanceOf(AgentRuntimeError);
    await expect(run).rejects.toMatchObject({code: "invalid_provider_response"});
    expect(fail).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", ["not json"]],
    ["a field the schema refuses", ['{"ok":"yes"}']],
  ])("rejects %s", async (_case, deltas) => {
    const {agentConfig, finalize, fail} = harness({deltas});
    const run = runWriterJson({actor, agentConfig, prompt: "brief", outputSchema: okSchema});
    await expect(run).rejects.toBeInstanceOf(AgentRuntimeError);
    await expect(run).rejects.toMatchObject({code: "invalid_provider_response"});
    expect(fail).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });
});

describe("generateWriterCopy", () => {
  const memberActor = {
    kind: "member" as const,
    userId: "user-1",
    profileId: "profile-1",
  };

  it("adopts the quota-reserved run before streaming and returns the parsed copy", async () => {
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
    const dependencies: Partial<WriterDependencies> = {
      runtime: {adoptPrestarted, stream},
      credentials: {openaiApiKey: "test"},
      enabled: true,
      model: "openai:gpt-4.1-mini",
    };

    await expect(generateWriterCopy({
      memberActor,
      runId: actor.runId,
      kind: "event",
      brief: "Launch copy",
      dependencies,
    })).resolves.toEqual({descriptionEn: "Launch copy", descriptionZh: "\u555f\u52d5\u6587\u6848"});

    expect(order).toEqual(["stream"]);
    expect(adoptPrestarted).toHaveBeenCalledWith(
      {agent: "writer", conversationId: null, profileId: "profile-1", trigger: "portal"},
      actor.runId,
    );
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      system: writerSystemPrompt("event"),
      tools: {},
    }));
  });

  it.each([...WRITER_KINDS])("validates kind %s against its own output schema", async (kind) => {
    const expected = writerOutputs[kind];
    const {dependencies, finalize, fail} = writerHarness([JSON.stringify(expected)]);

    await expect(generateWriterCopy({
      memberActor,
      runId: actor.runId,
      kind,
      brief: "brief",
      dependencies,
    })).resolves.toEqual(expected);

    expect(fail).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledOnce();
  });

  it("refuses another kind's shape for the kind requested", async () => {
    const {dependencies, finalize, fail} = writerHarness([JSON.stringify(writerOutputs.profile)]);

    await expect(generateWriterCopy({
      memberActor,
      runId: actor.runId,
      kind: "event",
      brief: "brief",
      dependencies,
    })).rejects.toMatchObject({code: "invalid_provider_response"});

    expect(fail).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });
});
