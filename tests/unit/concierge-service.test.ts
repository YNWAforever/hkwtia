import {describe, expect, it, vi} from "vitest";

import {
  AgentRuntimeError,
  type AgentRuntimeFinish,
  type AgentRuntimeFinalizationOverride,
} from "@/lib/ai/runtime";
import {
  createConciergeService,
  type ConciergeServiceDependencies,
  type ConciergeSseEvent,
} from "@/lib/ai/agents/concierge";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = {kind: "profile" as const, profileId: "profile-1"};

function asyncText(...values: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value;
    },
  };
}

async function eventsOf(
  turn: Awaited<ReturnType<ReturnType<typeof createConciergeService>["startTurn"]>>,
): Promise<ConciergeSseEvent[]> {
  const events: ConciergeSseEvent[] = [];
  for await (const event of turn.events) events.push(event);
  return events;
}

function finish(
  overrides: Partial<AgentRuntimeFinish> = {},
): AgentRuntimeFinish {
  return {
    status: "completed",
    runId: RUN_ID,
    usage: {inputTokens: 10, outputTokens: 5},
    costUsd: "0.000100",
    finishReason: "stop",
    steps: 1,
    citations: [],
    ...overrides,
  } as AgentRuntimeFinish;
}


function runtimeDouble(
  outcome: AgentRuntimeFinish = finish(),
  deltas: string[] = ["WTIA ", "answer"],
) {
  const prepared = {
    runId: RUN_ID,
    fail: vi.fn(async () => new AgentRuntimeError("provider_error")),
  };
  const finalize = vi.fn(async (override?: AgentRuntimeFinalizationOverride) => override && outcome.status !== "disabled"
    ? {
      ...outcome,
      status: "escalated" as const,
      code: override.code,
    }
    : outcome);
  const fail = vi.fn(async () => new AgentRuntimeError("provider_error"));
  return {
    prepared,
    finalize,
    fail,
    runtime: {
      prepare: vi.fn(async () => prepared),
      adoptPrestarted: vi.fn(() => prepared),
      stream: vi.fn(async () => ({
        runId: RUN_ID,
        textStream: asyncText(...deltas),
        finish: Promise.resolve(outcome),
        finalize,
        fail,
      })),
    },
  };
}
function dependencies(
  overrides: Partial<ConciergeServiceDependencies> = {},
): ConciergeServiceDependencies {
  return {
    agentsEnabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "test"},
    appOrigin: "https://www.hkwtia.org",
    conversations: {
      create: vi.fn(async () => ({
        id: CONVERSATION_ID,
        locale: "en" as const,
      })),
      getOwned: vi.fn(async () => ({
        id: CONVERSATION_ID,
        locale: "en" as const,
      })),
      appendMessage: vi.fn(async () => ({id: crypto.randomUUID()})),
      startAgentTurn: vi.fn(async () => ({id: RUN_ID})),
      listMessages: vi.fn(async () => [{
        role: "user" as const,
        content: "What is WTIA?",
      }]),
    },
    agentTools: {
      createStaffTask: vi.fn(async () => ({id: "task-1", status: "open" as const})),
    },
    getRuntime: vi.fn(() => runtimeDouble(finish({
      citations: [{
        sourceId: "kb:source",
        title: "WTIA membership",
        url: "https://www.hkwtia.org/membership",
        confidence: 0.9,
      }],
    })).runtime),
    getEmbedding: vi.fn(() => ({
      dimensions: 1536 as const,
      embed: vi.fn(async () => Array.from({length: 1536}, () => 0)),
    })),
    createTools: vi.fn(() => ({})),
    audit: vi.fn(async () => undefined),
    createRunId: () => RUN_ID,
    now: vi.fn(() => new Date("2026-07-27T10:00:00.000Z")),
    ...overrides,
  };
}

describe("Concierge service", () => {
  it("selects a fixed bilingual system prompt", () => {
    const service = createConciergeService(dependencies());

    expect(service.systemPrompt("en")).toContain("Respond in English");
    expect(service.systemPrompt("zh-HK")).toContain("繁體中文");
    expect(service.systemPrompt("en")).toContain("untrusted");
  });

  it("preserves member continuity and emits meta, deltas, citations, then done", async () => {
    const deps = dependencies();
    const service = createConciergeService(deps);

    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "What is WTIA?",
      locale: "en",
      trigger: "web",
    });

    expect(deps.conversations.getOwned).toHaveBeenCalledWith(
      OWNER,
      CONVERSATION_ID,
    );
    expect(deps.conversations.create).not.toHaveBeenCalled();
    expect(await eventsOf(turn)).toEqual([
      {event: "meta", data: {conversationId: CONVERSATION_ID, runId: RUN_ID}},
      {event: "delta", data: {text: "WTIA "}},
      {event: "delta", data: {text: "answer"}},
      {
        event: "done",
        data: {
          citations: [{
            sourceId: "kb:source",
            title: "WTIA membership",
            url: "https://www.hkwtia.org/membership",
          }],
          escalationId: null,
        },
      },
    ]);
    expect(deps.conversations.startAgentTurn).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({
        runId: RUN_ID,
        conversationId: CONVERSATION_ID,
      }),
      expect.objectContaining({role: "user", content: "What is WTIA?"}),
      expect.objectContaining({startedAt: expect.any(Date)}),
    );
    expect(deps.conversations.appendMessage).toHaveBeenCalledOnce();
    expect(deps.conversations.appendMessage).toHaveBeenCalledWith(
      OWNER,
      CONVERSATION_ID,
      expect.objectContaining({
        role: "assistant",
        content: "WTIA answer",
        citations: [expect.objectContaining({sourceId: "kb:source"})],
      }),
    );
  });

  it("creates an anonymous conversation with the supplied one-way owner hash", async () => {
    const anonymousOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "a".repeat(64),
    };
    const deps = dependencies();

    await createConciergeService(deps).startTurn({
      owner: anonymousOwner,
      profileId: null,
      message: "你好",
      locale: "zh-HK",
      trigger: "web",
    });

    expect(deps.conversations.create).toHaveBeenCalledWith(
      anonymousOwner,
      expect.objectContaining({locale: "zh-HK"}),
    );
  });

  it("persists a zero-cost disabled run and one deduplicated leave-message task without constructing AI clients", async () => {
    const disabledFinish = finish({
      status: "disabled",
      code: "agent_disabled",
      usage: {inputTokens: 0, outputTokens: 0},
      costUsd: "0.000000",
      finishReason: "disabled",
      steps: 0,
      citations: [],
    });
    const runtime = runtimeDouble(disabledFinish, []);
    const deps = dependencies({
      agentsEnabled: false,
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Help",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(runtime.runtime.stream).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      tools: {},
    }));
    expect(deps.getEmbedding).not.toHaveBeenCalled();
    expect(deps.createTools).not.toHaveBeenCalled();
    expect(deps.agentTools.createStaffTask).toHaveBeenCalledOnce();
    expect(deps.agentTools.createStaffTask).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({
        kind: "concierge_general_follow_up",
        summaryCode: "human_requested",
      }),
    );
    expect(events).toEqual([
      {event: "meta", data: {conversationId: CONVERSATION_ID, runId: RUN_ID}},
      {event: "disabled", data: {taskId: "task-1"}},
    ]);
  });


  it("fails the pending disabled run when leave-message task creation fails", async () => {
    const taskError = new Error("task persistence failed");
    const disabledFinish = finish({
      status: "disabled",
      code: "agent_disabled",
      usage: {inputTokens: 0, outputTokens: 0},
      costUsd: "0.000000",
      finishReason: "disabled",
      steps: 0,
      citations: [],
    });
    const runtime = runtimeDouble(disabledFinish, []);
    const deps = dependencies({
      agentsEnabled: false,
      agentTools: {
        createStaffTask: vi.fn(async () => {
          throw taskError;
        }),
      },
      getRuntime: vi.fn(() => runtime.runtime),
    });

    await expect(createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Help",
      locale: "en",
      trigger: "web",
    })).rejects.toBe(taskError);

    expect(runtime.fail).toHaveBeenCalledWith(taskError);
    expect(runtime.finalize).not.toHaveBeenCalled();
  });
  it("returns an escalation reference for an escalated runtime", async () => {
    const runtime = runtimeDouble(finish({
      status: "escalated",
      code: "low_confidence",
    }), ["I will ask staff."]);
    const deps = dependencies({
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Unclear fact",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(deps.agentTools.createStaffTask).toHaveBeenCalledOnce();
    expect(events.at(-1)).toEqual({
      event: "done",
      data: {citations: [], escalationId: "WTIA-task-1"},
    });
  });




  it("persists the assistant reply before finalizing the run", async () => {
    const order: string[] = [];
    const outcome = finish({
      citations: [{
        sourceId: "kb:grounded",
        title: "Grounded source",
        url: "https://www.hkwtia.org/grounded",
        confidence: 0.9,
      }],
    });
    const runtime = runtimeDouble(outcome, ["Grounded answer"]);
    runtime.finalize.mockImplementation(async () => {
      order.push("finalize");
      return outcome;
    });
    const base = dependencies();
    const deps = dependencies({
      conversations: {
        ...base.conversations,
        startAgentTurn: vi.fn(async (_owner, _actor, value) => {
          order.push((value as {role: string}).role);
          return {id: RUN_ID};
        }),
        appendMessage: vi.fn(async (_owner, _conversationId, value) => {
          order.push((value as {role: string}).role);
          return {id: crypto.randomUUID()};
        }),
      },
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Tell me about WTIA",
      locale: "en",
      trigger: "web",
    });
    await eventsOf(turn);

    expect(order).toEqual(["user", "assistant", "finalize"]);
  });

  it("fails instead of finalizing when the assistant reply is not durable", async () => {
    const appendError = new Error("assistant append failed");
    const outcome = finish({
      citations: [{
        sourceId: "kb:grounded",
        title: "Grounded source",
        url: "https://www.hkwtia.org/grounded",
        confidence: 0.9,
      }],
    });
    const runtime = runtimeDouble(outcome, ["Grounded answer"]);
    const base = dependencies();
    const deps = dependencies({
      conversations: {
        ...base.conversations,
        appendMessage: vi.fn(async () => Promise.reject(appendError)),
      },
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Tell me about WTIA",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(runtime.fail).toHaveBeenCalledWith(appendError);
    expect(runtime.finalize).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      event: "error",
      data: {code: "AI_TEMPORARILY_UNAVAILABLE"},
    });
  });
  it("withholds and escalates a substantive answer below the grounding threshold", async () => {
    const runtime = runtimeDouble(finish({
      citations: [{
        sourceId: "kb:weak",
        title: "Weak WTIA match",
        url: "https://www.hkwtia.org/weak",
        confidence: 0.71,
      } as AgentRuntimeFinish["citations"][number]],
    }), ["Unsupported WTIA claim"]);
    const deps = dependencies({
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "What benefits does WTIA membership include?",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(events).not.toContainEqual({
      event: "delta",
      data: {text: "Unsupported WTIA claim"},
    });
    expect(events.at(-1)).toEqual({
      event: "done",
      data: {citations: [], escalationId: "WTIA-task-1"},
    });
    expect(runtime.finalize).toHaveBeenCalledWith({
      status: "escalated",
      code: "low_confidence",
    });
    expect(deps.conversations.appendMessage).toHaveBeenLastCalledWith(
      OWNER,
      CONVERSATION_ID,
      expect.objectContaining({
        role: "assistant",
        content: expect.not.stringContaining("Unsupported WTIA claim"),
      }),
    );
  });

  it("creates one safe escalation reference after a post-tool provider failure", async () => {
    const runtime = runtimeDouble();
    const failure = new AgentRuntimeError("provider_error", 1);
    runtime.runtime.stream.mockImplementation(async () => ({
      runId: RUN_ID,
      textStream: asyncText(),
      finish: Promise.reject(failure),
      finalize: runtime.finalize,
      fail: runtime.fail,
    }));
    const deps = dependencies({
      getRuntime: vi.fn(() => runtime.runtime),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Check current WTIA funding support",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(deps.agentTools.createStaffTask).toHaveBeenCalledOnce();
    expect(deps.agentTools.createStaffTask).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({
        kind: "concierge_escalation",
        summaryCode: "tool_unavailable",
        reasonCode: "tool_unavailable",
      }),
    );
    expect(events.at(-1)).toEqual({
      event: "error",
      data: {
        code: "AI_TEMPORARILY_UNAVAILABLE",
        escalationId: "WTIA-task-1",
      },
    });
    expect(JSON.stringify(events)).not.toContain("provider");
  });
  it("adopts and fails the atomically prestarted run when turn preparation fails", async () => {
    const prepError = new Error("history unavailable");
    const runtime = runtimeDouble();
    const base = dependencies();
    const deps = dependencies({
      conversations: {
        ...base.conversations,
        listMessages: vi.fn(async () => {
          throw prepError;
        }),
      },
      getRuntime: vi.fn(() => runtime.runtime),
    });

    await expect(createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "What is WTIA?",
      locale: "en",
      trigger: "web",
    })).rejects.toBe(prepError);

    expect(runtime.runtime.adoptPrestarted).toHaveBeenCalledOnce();
    expect(runtime.prepared.fail).toHaveBeenCalledWith(prepError);
    expect(runtime.runtime.stream).not.toHaveBeenCalled();
  });
  it("aborts provider work when the downstream stream disconnects", async () => {
    let seenSignal: AbortSignal | undefined;
    const providerCancelled = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
      const deps = dependencies({
        getRuntime: vi.fn(() => ({
          adoptPrestarted: vi.fn(() => ({
            runId: RUN_ID,
            fail: vi.fn(async () => new AgentRuntimeError("provider_error")),
          })),
          prepare: vi.fn(),
          stream: vi.fn(async (request) => {
            seenSignal = request.abortSignal;
            const outcome = finish();
            return {
              runId: RUN_ID,
              textStream: {
                async *[Symbol.asyncIterator]() {
                  yield "first";
                  if (request.abortSignal?.aborted) {
                    resolve();
                  } else {
                    await new Promise<void>((done) => {
                      request.abortSignal?.addEventListener("abort", () => {
                        resolve();
                        done();
                      }, {once: true});
                    });
                  }
                },
              },
              finish: Promise.resolve(outcome),
              finalize: vi.fn(async () => outcome),
              fail: vi.fn(async () => new AgentRuntimeError("provider_error")),
            };
          }),
        })),
      });
      void createConciergeService(deps).startTurn({
        owner: OWNER,
        profileId: OWNER.profileId,
        message: "Hello",
        locale: "en",
        trigger: "web",
      }).then(async (turn) => {
        const iterator = turn.events[Symbol.asyncIterator]();
        await iterator.next();
        await iterator.next();
        await turn.cancel();
      });
    });

    await providerCancelled;
    expect(seenSignal?.aborted).toBe(true);
  });
});
