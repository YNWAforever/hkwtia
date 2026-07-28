import {describe, expect, it, vi} from "vitest";

import {
  AgentRuntimeError,
  createAgentRuntime,
  type AgentRuntimeRequest,
} from "@/lib/ai/runtime";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = {
  conversationId: "11111111-1111-4111-8111-111111111111",
  profileId: "profile-1",
  trigger: "web" as const,
};
const NOW = new Date("2026-07-28T02:00:00.000Z");

function createHarness(
  configureModel: () => Promise<unknown> = async () => ({id: RUN_ID}),
) {
  const agentRuns = {
    start: vi.fn(async () => ({id: RUN_ID})),
    configureModel: vi.fn(configureModel),
    finish: vi.fn(async () => ({id: RUN_ID})),
    fail: vi.fn(async () => ({id: RUN_ID})),
    escalate: vi.fn(async () => ({id: RUN_ID})),
    disable: vi.fn(async () => ({id: RUN_ID})),
  };
  const providerStream = vi.fn(() => ({
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
  }));
  const runtime = createAgentRuntime({
    agentRuns,
    providerFactories: {
      openai: () => ({stream: providerStream}),
      anthropic: vi.fn(),
    },
    createRunId: () => RUN_ID,
    now: () => NOW,
  });
  const request = (preparedRun: AgentRuntimeRequest["preparedRun"]) => ({
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "test"},
    actor: ACTOR,
    system: "System",
    messages: [{role: "user" as const, content: "Question"}],
    tools: {},
    preparedRun,
    finalization: "deferred" as const,
  });
  return {agentRuns, providerStream, request, runtime};
}

describe("AI runtime prepared handles", () => {
  it("rejects sequential prepared-handle reuse without disturbing the active run", async () => {
    const harness = createHarness();
    const prepared = await harness.runtime.prepare(ACTOR);
    const active = await harness.runtime.stream(harness.request(prepared));

    await expect(
      harness.runtime.stream(harness.request(prepared)),
    ).rejects.toMatchObject({code: "configuration_error"});
    await active.finalize();

    expect(harness.agentRuns.configureModel).toHaveBeenCalledOnce();
    expect(harness.providerStream).toHaveBeenCalledOnce();
    expect(harness.agentRuns.fail).not.toHaveBeenCalled();
    expect(harness.agentRuns.finish).toHaveBeenCalledOnce();
  });

  it("atomically rejects concurrent adopted-handle reuse before side effects", async () => {
    let releaseConfigure: () => void = () => undefined;
    const configure = new Promise<unknown>((resolve) => {
      releaseConfigure = () => resolve({id: RUN_ID});
    });
    const harness = createHarness(() => configure);
    const prepared = harness.runtime.adoptPrestarted(ACTOR, RUN_ID);

    const first = harness.runtime.stream(harness.request(prepared));
    const second = harness.runtime.stream(harness.request(prepared));
    await Promise.resolve();
    releaseConfigure();
    const settled = await Promise.allSettled([first, second]);
    const active = settled.find(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof harness.runtime.stream>>
      > => result.status === "fulfilled",
    );

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(settled.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({code: "configuration_error"}),
    });
    await active!.value.finalize();
    expect(harness.agentRuns.start).not.toHaveBeenCalled();
    expect(harness.agentRuns.configureModel).toHaveBeenCalledOnce();
    expect(harness.providerStream).toHaveBeenCalledOnce();
    expect(harness.agentRuns.fail).not.toHaveBeenCalled();
    expect(harness.agentRuns.finish).toHaveBeenCalledOnce();
  });

  it("preserves a cancelled terminal row on reuse and rejects misleading finalize", async () => {
    const harness = createHarness();
    const prepared = harness.runtime.adoptPrestarted(ACTOR, RUN_ID);
    const active = await harness.runtime.stream(harness.request(prepared));

    await active.fail(new AgentRuntimeError("timeout"));
    await expect(
      harness.runtime.stream(harness.request(prepared)),
    ).rejects.toMatchObject({code: "configuration_error"});
    await expect(active.finalize()).rejects.toMatchObject({code: "timeout"});

    expect(harness.agentRuns.configureModel).toHaveBeenCalledOnce();
    expect(harness.providerStream).toHaveBeenCalledOnce();
    expect(harness.agentRuns.fail).toHaveBeenCalledOnce();
    expect(harness.agentRuns.finish).not.toHaveBeenCalled();
    expect(harness.agentRuns.escalate).not.toHaveBeenCalled();
    expect(harness.agentRuns.disable).not.toHaveBeenCalled();
  });
});
