import {describe, expect, it, vi} from "vitest";

import {createAgentRuntime} from "@/lib/ai/runtime";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = {
  conversationId: "11111111-1111-4111-8111-111111111111",
  profileId: "profile-1",
  trigger: "web" as const,
};
const COMPLETED_AT = new Date("2026-07-28T01:00:01.000Z");

describe("AI runtime prestarted-run adoption", () => {
  it("adopts exact provenance without inserting a duplicate run", async () => {
    const agentRuns = {
      start: vi.fn(async () => ({id: RUN_ID})),
      configureModel: vi.fn(async () => ({id: RUN_ID})),
      finish: vi.fn(async () => ({id: RUN_ID})),
      fail: vi.fn(async () => ({id: RUN_ID})),
      escalate: vi.fn(async () => ({id: RUN_ID})),
      disable: vi.fn(async () => ({id: RUN_ID})),
    };
    const runtime = createAgentRuntime({
      agentRuns,
      providerFactories: {
        openai: () => ({
          stream: () => ({
            textStream: {
              async *[Symbol.asyncIterator]() {
                yield "answer";
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
      now: () => COMPLETED_AT,
    });

    const prepared = runtime.adoptPrestarted(ACTOR, RUN_ID);
    const result = await runtime.stream({
      enabled: true,
      model: "openai:gpt-4.1-mini",
      credentials: {openaiApiKey: "test"},
      actor: ACTOR,
      system: "System",
      messages: [{role: "user", content: "Question"}],
      tools: {},
      preparedRun: prepared,
      finalization: "deferred",
    });
    for await (const _delta of result.textStream) {
      void _delta;
      // Drain the provider stream before finalization.
    }
    await result.finalize();

    expect(agentRuns.start).not.toHaveBeenCalled();
    expect(agentRuns.configureModel).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        conversationId: ACTOR.conversationId,
        profileId: ACTOR.profileId,
        trigger: ACTOR.trigger,
      }),
      expect.anything(),
    );
    expect(agentRuns.finish).toHaveBeenCalledOnce();
    expect(agentRuns.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        conversationId: ACTOR.conversationId,
        profileId: ACTOR.profileId,
        trigger: ACTOR.trigger,
      }),
      expect.anything(),
    );
  });
});
