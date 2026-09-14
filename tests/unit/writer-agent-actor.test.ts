import {describe, expect, it, vi} from "vitest";

import {requireAgentRunActor, requireWriterAgent} from "@/lib/auth/agent-actor";
import {createAgentRuntime} from "@/lib/ai/runtime";

const writer = {
  kind: "agent",
  agent: "writer",
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: null,
  profileId: "profile-1",
  trigger: "portal",
} as const;

describe("writer agent actor", () => {
  it("accepts the writer shape and returns it", () => {
    expect(requireWriterAgent(writer)).toBe(writer);
    expect(requireAgentRunActor(writer)).toBe(writer);
  });

  it.each([
    ["no profile", {...writer, profileId: null}],
    ["a conversation", {...writer, conversationId: "c-1"}],
    ["the wrong trigger", {...writer, trigger: "web"}],
    ["the wrong agent", {...writer, agent: "concierge"}],
  ])("refuses %s", (_case, candidate) => {
    expect(() => requireWriterAgent(candidate as never)).toThrow("FORBIDDEN");
    expect(() => requireAgentRunActor(candidate as never)).toThrow("FORBIDDEN");
  });
});

describe("writer actor through the real runtime", () => {
  it("builds the writer actor and adopts it instead of inserting a run", async () => {
    const agentRuns = {
      start: vi.fn(async () => ({id: writer.runId})),
      configureModel: vi.fn(async () => ({id: writer.runId})),
      finish: vi.fn(async () => ({id: writer.runId})),
      fail: vi.fn(async () => ({id: writer.runId})),
      escalate: vi.fn(async () => ({id: writer.runId})),
      disable: vi.fn(async () => ({id: writer.runId})),
    };
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: {
              async *[Symbol.asyncIterator]() {
                yield "{}";
              },
            },
            finish: Promise.resolve({
              usage: {inputTokens: 10, outputTokens: 5},
              finishReason: "stop",
              steps: 1,
              toolExecutions: 0,
              citations: [],
            }),
          }),
        }),
        anthropic: vi.fn(),
      },
      now: () => new Date("2026-09-14T01:00:01.000Z"),
    });

    const actorInput = {
      agent: "writer" as const,
      conversationId: null,
      profileId: "profile-1",
      trigger: "portal" as const,
    };
    const prepared = runtime.adoptPrestarted(actorInput, writer.runId);
    const result = await runtime.stream({
      enabled: true,
      model: "openai:gpt-4.1-mini",
      credentials: {openaiApiKey: "test"},
      actor: actorInput,
      system: "System",
      messages: [{role: "user", content: "brief"}],
      tools: {},
      preparedRun: prepared,
      finalization: "deferred",
    });
    for await (const _delta of result.textStream) {
      void _delta;
    }
    await result.finalize();

    expect(agentRuns.start).not.toHaveBeenCalled();
    expect(agentRuns.configureModel).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "agent",
        agent: "writer",
        runId: writer.runId,
        conversationId: null,
        profileId: "profile-1",
        trigger: "portal",
      }),
      expect.anything(),
    );
  });
});
