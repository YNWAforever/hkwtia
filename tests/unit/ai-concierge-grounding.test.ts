// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  createConciergeService,
  type ConciergeSseEvent,
} from "@/lib/ai/agents/concierge";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { syntheticAiBudget } from "@/tests/helpers/ai-budget";
import { approvedFactsHash } from "@/lib/ai/drafts/validation";
import type { ApprovedFactPack } from "@/lib/ai/drafts/contracts";
const runId = "00000000-0000-4000-8000-000000000008",
  conversationId = "00000000-0000-4000-8000-000000000009",
  sourceId = "00000000-0000-4000-8000-000000000007";
const instant = new Date("2026-10-01T00:00:00Z");
function facts(): ApprovedFactPack {
  const pack: ApprovedFactPack = {
    caseId: conversationId,
    locale: "en",
    versionHash: "a".repeat(64),
    asOf: instant.toISOString(),
    values: {
      membershipFee: {
        value: 100,
        sourceId,
        label: "Membership fee",
        format: "money",
        currency: "HKD",
      },
    },
    sourceRefs: [
      {
        sourceId,
        version: "1",
        locale: "en",
        audience: "public",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: null,
        contentHash: "b".repeat(64),
      },
    ],
    recordSources: {},
    sourceUrls: { [sourceId]: "https://example.test/policy" },
    comparisonAvailable: false,
    displayLabels: { yes: "Yes", no: "No", notAvailable: "Not available" },
  };
  return { ...pack, versionHash: approvedFactsHash(pack) };
}
/** Explicit synthetic provider/lifecycle/ledger unit doubles. These are not DB/browser/provider acceptance receipts. */
function harness(
  body = "The synthetic fee is HK$90.",
  reader: "ready" | "fail" | "missing" = "ready",
) {
  const agentRuns = {
    start: vi.fn(async () => ({ id: runId })),
    configureModel: vi.fn(async () => ({ id: runId })),
    finish: vi.fn(async () => ({ id: runId })),
    fail: vi.fn(async () => ({ id: runId })),
    escalate: vi.fn(async () => ({ id: runId })),
    disable: vi.fn(async () => ({ id: runId })),
  };
  const provider = vi.fn(() => ({
    textStream: {
      async *[Symbol.asyncIterator]() {
        yield body.slice(0, 8);
        yield body.slice(8);
      },
    },
    finish: Promise.resolve({
      usage: { inputTokens: 100, outputTokens: 20 },
      finishReason: "stop",
      steps: 1,
      toolExecutions: 1,
      citations: [
        {
          sourceId,
          title: "Synthetic approved fee",
          url: "https://example.test/policy",
          retrievalScore: 0.99,
          knowledgeRef: facts().sourceRefs[0],
        },
      ],
      claims: [{ field: "membershipFee", value: 100, sourceId }],
    }),
  }));
  const budget = syntheticAiBudget();
  const runtime = createAgentRuntime({
    budget,
    agentRuns,
    providerFactories: {
      openai: () => ({ stream: provider }),
      anthropic: vi.fn(),
    },
    createRunId: () => runId,
    now: () => instant,
  });
  const conversations = {
    create: vi.fn(async () => ({ id: conversationId, locale: "en" as const })),
    getOwned: vi.fn(async () => ({
      id: conversationId,
      locale: "en" as const,
    })),
    appendMessage: vi.fn(async () => ({ id: "synthetic-message" })),
    startAgentTurn: vi.fn(async () => ({ id: runId })),
    listMessages: vi.fn(async () => [
      { role: "user" as const, content: "What is the membership fee?" },
    ]),
  };
  const getApprovedFacts = vi.fn(async () => {
    if (reader === "fail") throw Error("SYNTHETIC_SOURCE_UNAVAILABLE");
    return facts();
  });
  const dependencies = {
    agentsEnabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: { openaiApiKey: "synthetic-test" },
    appOrigin: "https://example.test",
    conversations,
    agentTools: {
      createStaffTask: vi.fn(async () => ({
        id: "synthetic-task",
        status: "open" as const,
      })),
    },
    getRuntime: () => runtime,
    getEmbedding: () => ({
      dimensions: 1536 as const,
      embed: async () => Array<number>(1536).fill(0),
    }),
    createTools: () => ({}),
    audit: vi.fn(async () => {}),
    createRunId: () => runId,
    now: () => instant,
    ...(reader === "missing" ? {} : { getApprovedFacts }),
  };
  return {
    service: createConciergeService(dependencies),
    provider,
    getApprovedFacts,
    budget,
    conversations,
  };
}
async function collect(service: ReturnType<typeof createConciergeService>) {
  const turn = await service.startTurn({
    owner: { kind: "profile", profileId: "synthetic-profile" },
    profileId: "synthetic-profile",
    conversationId,
    message: "What is the membership fee?",
    locale: "en",
    trigger: "web",
  });
  const events: ConciergeSseEvent[] = [];
  for await (const event of turn.events) events.push(event);
  const visible = events
    .flatMap((event) => (event.event === "delta" ? [event.data.text] : []))
    .join("");
  return { events, visible };
}
describe("public final-body grounding through the actual Concierge/runtime", () => {
  it("unsupported_fee_never_reaches_public_delta despite .99 relevance and model claims fee100", async () => {
    const h = harness();
    const { events, visible } = await collect(h.service);
    expect(h.provider).toHaveBeenCalledOnce();
    expect(visible).not.toContain("90");
    expect(events.find((event) => event.event === "done")?.data).toMatchObject({
      citations: [],
    });
    expect(h.budget.settleAiBudget).toHaveBeenCalledOnce();
    expect(h.budget.releaseUndispatched).not.toHaveBeenCalled();
    expect(h.conversations.appendMessage).toHaveBeenCalledWith(
      expect.anything(),
      conversationId,
      expect.objectContaining({ content: expect.not.stringContaining("90") }),
    );
  });
  it("renders the exact authoritative monetary fact before displaying or storing the final answer", async () => {
    const h = harness(
      "Verified details:\n{{facts.membershipFee}}\nPlease contact staff.",
    );
    const { visible } = await collect(h.service);
    expect(visible).toContain("Membership fee: HK$100.00");
    expect(visible).not.toContain("{{facts.");
    expect(h.getApprovedFacts).toHaveBeenCalledOnce();
    expect(h.conversations.appendMessage).toHaveBeenCalledWith(
      expect.anything(),
      conversationId,
      expect.objectContaining({ content: visible }),
    );
  });
  it("handoffs when a current source read fails, with no wrong answer or public citations", async () => {
    const h = harness("The synthetic fee is HK$90.", "fail");
    const { events, visible } = await collect(h.service);
    expect(visible).not.toContain("90");
    expect(events.find((event) => event.event === "done")?.data).toMatchObject({
      citations: [],
    });
    expect(h.budget.settleAiBudget).toHaveBeenCalledOnce();
  });
  it("fails closed on critical raw values when no approved server facts reader is configured", async () => {
    const h = harness("The synthetic fee is HK$100.", "missing");
    const { visible } = await collect(h.service);
    expect(visible).not.toContain("HK$100");
    expect(h.provider).toHaveBeenCalledOnce();
  });
});
