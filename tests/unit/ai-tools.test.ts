import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import type {EmbeddingAdapter} from "@/lib/ai/embeddings";
import {
  APPROVED_CONCIERGE_TOOL_NAMES,
  createConciergeTools,
  type ConciergeToolAuditEvent,
  type ConciergeToolRepositories,
} from "@/lib/ai/tools/registry";
import {createAgentToolsRepository} from "@/lib/db/repos/agent-tools";

const runId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const profileId = "member-profile";
const actor: ConciergeAgentActor = {
  kind: "agent",
  agent: "concierge",
  runId,
  conversationId,
  profileId,
  trigger: "web",
};
const anonymousActor: ConciergeAgentActor = {...actor, profileId: null};
const vector = Object.freeze(Array.from({length: 1536}, () => 0.01));

function fixture(options: {
  actor?: ConciergeAgentActor;
  confirmedContactEmail?: string;
  audit?: (event: ConciergeToolAuditEvent) => Promise<void>;
} = {}) {
  const repositories: ConciergeToolRepositories = {
    searchKnowledge: vi.fn(async () => [{
      title: "Membership guide",
      url: "https://www.hkwtia.org/en/membership",
      excerpt: "Member information",
      score: 0.9,
    }]),
    getMemberContext: vi.fn(async () => ({
      displayName: "Alice",
      preferredLocale: "en" as const,
      companyDisplayName: "Acme",
      membershipTier: "corporate",
      membershipStatus: "active",
      renewalDate: "2027-07-27T00:00:00.000Z",
    })),
    listEvents: vi.fn(async () => [{
      slug: "member-networking",
      title: "Member networking",
      description: "Meet the community",
      startsAt: "2027-01-01T10:00:00.000Z",
      endsAt: null,
      venue: "Central",
    }]),
    createDraftEmailApproval: vi.fn(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      status: "pending" as const,
    })),
    createStaffTask: vi.fn(async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      status: "open" as const,
    })),
  };
  const embedding: EmbeddingAdapter = {
    dimensions: 1536,
    embed: vi.fn(async () => vector),
  };
  const auditEvents: ConciergeToolAuditEvent[] = [];
  const audit = options.audit ?? vi.fn(async (event) => {
    auditEvents.push(event);
  });
  const tools = createConciergeTools({
    actor: options.actor ?? actor,
    locale: "en",
    repositories,
    embedding,
    ...(options.confirmedContactEmail
      ? {confirmedContactEmail: options.confirmedContactEmail}
      : {}),
    appOrigin: "https://www.hkwtia.org",
    audit,
  });
  return {tools, repositories, embedding, audit, auditEvents};
}

async function execute(
  tool: ReturnType<typeof createConciergeTools>[string],
  input: unknown,
) {
  return tool.execute(input, {});
}

describe("policy-safe Concierge tool registry", () => {
  it("exports exactly the seven approved provider-visible closures", () => {
    const {tools} = fixture();
    expect(Object.keys(tools)).toEqual(APPROVED_CONCIERGE_TOOL_NAMES);
    expect(APPROVED_CONCIERGE_TOOL_NAMES).toEqual([
      "kb_search",
      "get_member_context",
      "list_events",
      "get_funding_schemes",
      "draft_email",
      "create_task",
      "escalate",
    ]);
    expect(JSON.stringify(Object.keys(tools))).not.toMatch(
      /membership|payment|role|approve|send|database|sql/i,
    );
  });

  it("embeds bounded KB input and forces namespace, actor locale, and normalized citations", async () => {
    const {tools, repositories, embedding} = fixture();
    const result = await execute(tools.kb_search!, {query: "membership", k: 3});
    expect(embedding.embed).toHaveBeenCalledWith("membership");
    expect(repositories.searchKnowledge).toHaveBeenCalledWith(actor, {
      namespace: "m4a-core-v1",
      locale: "en",
      queryEmbedding: vector,
      k: 3,
    });
    expect(result.citations).toEqual([{
      sourceId: expect.stringMatching(/^kb:/),
      title: "Membership guide",
      url: "https://www.hkwtia.org/en/membership",
      confidence: 0.9,
    }]);
    expect(result.value).toEqual([expect.objectContaining({
      code: "ok",
      excerpt: "Member information",
    })]);
    expect(JSON.stringify(result)).not.toMatch(/embedding|metadata/i);
  });

  it.each([
    {},
    {query: "", k: 1},
    {query: "x".repeat(501), k: 1},
    {query: "ok", k: 0},
    {query: "ok", k: 11},
    {query: "ok", k: 1, profileId},
  ])("rejects hostile KB schema input before embedding or repository access", async (input) => {
    const {tools, repositories, embedding} = fixture();
    await expect(execute(tools.kb_search!, input)).rejects.toThrow();
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(repositories.searchKnowledge).not.toHaveBeenCalled();
  });

  it("denies anonymous member context before repository access and audits without PII", async () => {
    const {tools, repositories, auditEvents} = fixture({actor: anonymousActor});
    await expect(execute(tools.get_member_context!, {})).resolves.toEqual({
      value: [{code: "member_context_denied"}],
    });
    expect(repositories.getMemberContext).not.toHaveBeenCalled();
    expect(auditEvents).toEqual([expect.objectContaining({
      tool: "get_member_context",
      runId,
      conversationId,
      phase: "outcome",
      outcome: "denied",
    })]);
    expect(JSON.stringify(auditEvents)).not.toMatch(
      /Alice|Acme|email|query|profile/i,
    );
  });

  it("returns only the minimal member DTO bound to actor.profileId", async () => {
    const {tools, repositories} = fixture();
    const result = await execute(tools.get_member_context!, {});
    expect(repositories.getMemberContext).toHaveBeenCalledWith(actor);
    expect(result.value).toEqual([{
      code: "ok",
      displayName: "Alice",
      preferredLocale: "en",
      companyDisplayName: "Acme",
      membershipTier: "corporate",
      membershipStatus: "active",
      renewalDate: "2027-07-27T00:00:00.000Z",
    }]);
    expect(JSON.stringify(result)).not.toMatch(
      /member-profile|email|phone|address|auth|stripe|subscription|payment|role|note|approval/i,
    );
  });

  it("rejects actor/profile injection in member context", async () => {
    const {tools, repositories} = fixture();
    await expect(execute(tools.get_member_context!, {profileId: "other"}))
      .rejects.toThrow();
    expect(repositories.getMemberContext).not.toHaveBeenCalled();
  });

  it("audits malicious schema input without recording rejected values", async () => {
    const {tools, repositories, auditEvents} = fixture();
    await expect(execute(tools.get_member_context!, {
      profileId: "other-secret-profile",
    })).rejects.toThrow();
    expect(repositories.getMemberContext).not.toHaveBeenCalled();
    expect(auditEvents).toEqual([expect.objectContaining({
      tool: "get_member_context",
      phase: "outcome",
      outcome: "denied",
    })]);
    expect(JSON.stringify(auditEvents)).not.toContain("other-secret-profile");
  });
  it("applies public/member visibility, locale, time, and result bounds through the scoped event repository", async () => {
    const {tools, repositories} = fixture();
    const result = await execute(tools.list_events!, {
      from: "2026-07-27T00:00:00.000Z",
      to: "2027-07-27T00:00:00.000Z",
      limit: 10,
    });
    expect(repositories.listEvents).toHaveBeenCalledWith(actor, {
      locale: "en",
      from: new Date("2026-07-27T00:00:00.000Z"),
      to: new Date("2027-07-27T00:00:00.000Z"),
      limit: 10,
    });
    expect(result.value).toEqual([expect.objectContaining({
      code: "ok",
      slug: "member-networking",
    })]);
    expect(result.citations).toEqual([{
      sourceId: "event:member-networking",
      title: "Member networking",
      url: "https://www.hkwtia.org/en/events/member-networking",
      confidence: 1,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/published|draft|capacity|admin/i);
  });

  it("returns deterministic immutable funding projections without calling embedding or repositories", async () => {
    const {tools, repositories, embedding} = fixture();
    const input = {
      hongKongIncorporated: true,
      hongKongBusinessRegistered: true,
      operatesInHongKong: true,
      nonSubvented: true,
      expansionProjectInCoveredEconomy: true,
      advancedTechnologyTraining: true,
      traineeHongKongPermanentResident: true,
      smartProductionLineInHongKong: true,
      targetSector: "ai-data-science",
      enterpriseInvestmentHkd: 100_000_000,
      totalProjectCostHkd: 150_000_000,
      eligibleAppliedRdOrPartnershipExpenditureHkd: 1_000_000,
    };
    const first = await execute(tools.get_funding_schemes!, input);
    const second = await execute(tools.get_funding_schemes!, input);
    expect(first).toEqual(second);
    expect((first.value as Array<{id: string}>).map(({id}) => id)).toEqual([
      "bud", "nittp", "nifs", "nias", "rd-cash-rebate",
    ]);
    expect(JSON.stringify(first)).not.toMatch(
      /technology voucher|(^|[^a-z])tvp([^a-z]|$)|export marketing fund|"emf"/i,
    );
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(Object.values(repositories).every((value) =>
      !vi.isMockFunction(value) || value.mock.calls.length === 0
    )).toBe(true);
  });

  it("creates only a pending draft approval for the confirmed exact recipient", async () => {
    const {tools, repositories, auditEvents} = fixture({
      confirmedContactEmail: " Member@Example.com ",
    });
    const result = await execute(tools.draft_email!, {
      recipient: "member@example.com",
      recipientConfirmed: true,
      subject: "Follow-up",
      body: "Plain text only.",
    });
    expect(repositories.createDraftEmailApproval).toHaveBeenCalledWith(actor, {
      to: "member@example.com",
      subject: "Follow-up",
      text: "Plain text only.",
      locale: "en",
      conversationId,
      agentRunId: runId,
    });
    expect(result.value).toEqual([{
      code: "ok",
      approvalId: "33333333-3333-4333-8333-333333333333",
      approvalType: "agent.draft_email",
      status: "pending",
    }]);
    expect(auditEvents.map(({phase, outcome}) => [phase, outcome])).toEqual([
      ["pre", "authorized"],
      ["outcome", "success"],
    ]);
  });

  it.each([
    {recipient: "other@example.com", recipientConfirmed: true, subject: "Hi", body: "Text"},
    {recipient: "member@example.com", recipientConfirmed: false, subject: "Hi", body: "Text"},
    {recipient: "member@example.com", recipientConfirmed: true, subject: "Hi", body: "<p>HTML</p>"},
    {recipient: "member@example.com", recipientConfirmed: true, subject: "x".repeat(201), body: "Text"},
    {recipient: "member@example.com", recipientConfirmed: true, subject: "Hi", body: "x".repeat(10_001)},
    {recipient: "member@example.com", recipientConfirmed: true, subject: "Hi", body: "Text", send: true},
  ])("denies unsafe draft-email input before approval/email side effects", async (input) => {
    const {tools, repositories} = fixture({
      confirmedContactEmail: "member@example.com",
    });
    const promise = execute(tools.draft_email!, input);
    if (input.recipient === "other@example.com" || !input.recipientConfirmed) {
      await expect(promise).resolves.toEqual({
        value: [{code: "draft_email_recipient_denied"}],
      });
    } else {
      await expect(promise).rejects.toThrow();
    }
    expect(repositories.createDraftEmailApproval).not.toHaveBeenCalled();
  });

  it("fails closed when pre-execution audit is unavailable", async () => {
    const {tools, repositories} = fixture({
      confirmedContactEmail: "member@example.com",
      audit: vi.fn(async () => {
        throw new Error("audit outage");
      }),
    });
    await expect(execute(tools.draft_email!, {
      recipient: "member@example.com",
      recipientConfirmed: true,
      subject: "Hi",
      body: "Text",
    })).resolves.toEqual({value: [{code: "audit_unavailable"}]});
    await expect(execute(tools.create_task!, {
      kind: "general_follow_up",
      reason: "provider_handoff",
    })).resolves.toEqual({value: [{code: "audit_unavailable"}]});
    expect(repositories.createDraftEmailApproval).not.toHaveBeenCalled();
    expect(repositories.createStaffTask).not.toHaveBeenCalled();
  });

  it("creates safe-code tasks and escalations with actor-bound context and stable full-UUID references", async () => {
    const {tools, repositories} = fixture({
      confirmedContactEmail: "member@example.com",
    });
    await expect(execute(tools.create_task!, {
      kind: "funding_follow_up",
      reason: "provider_handoff",
    })).resolves.toEqual({
      value: [{
        code: "ok",
        taskId: "44444444-4444-4444-8444-444444444444",
        status: "open",
      }],
    });
    await expect(execute(tools.escalate!, {
      reason: "human_requested",
    })).resolves.toEqual({
      value: [{
        code: "ok",
        taskId: "44444444-4444-4444-8444-444444444444",
        status: "open",
        reference: "WTIA-44444444-4444-4444-8444-444444444444",
      }],
    });
    expect(repositories.createStaffTask).toHaveBeenNthCalledWith(1, actor, {
      profileId,
      kind: "concierge_funding_follow_up",
      summaryCode: "provider_handoff",
      reasonCode: "provider_handoff",
      locale: "en",
      contactEmail: "member@example.com",
    });
    expect(repositories.createStaffTask).toHaveBeenNthCalledWith(2, actor, {
      profileId,
      kind: "concierge_escalation",
      summaryCode: "human_requested",
      reasonCode: "human_requested",
      locale: "en",
      contactEmail: "member@example.com",
    });
  });

  it.each([
    ["create_task", {kind: "arbitrary", reason: "provider_handoff"}],
    ["create_task", {kind: "general_follow_up", reason: "free form"}],
    ["create_task", {kind: "general_follow_up", reason: "provider_handoff", profileId: "other"}],
    ["escalate", {reason: "free form"}],
    ["escalate", {reason: "human_requested", actor: "admin"}],
  ] as const)("rejects arbitrary staff-task policy input for %s", async (name, input) => {
    const {tools, repositories} = fixture();
    await expect(execute(tools[name]!, input)).rejects.toThrow();
    expect(repositories.createStaffTask).not.toHaveBeenCalled();
  });

  it("keeps audit metadata code-only and PII-free on repository errors", async () => {
    const {tools, repositories, auditEvents} = fixture();
    vi.mocked(repositories.searchKnowledge).mockRejectedValueOnce(
      new Error("database exposed member@example.com"),
    );
    await expect(execute(tools.kb_search!, {query: "secret Alice", k: 1}))
      .resolves.toEqual({value: [{code: "kb_search_failed"}]});
    expect(JSON.stringify(auditEvents)).not.toMatch(
      /secret|Alice|example\\.com|database/i,
    );
    expect(auditEvents).toEqual([expect.objectContaining({
      tool: "kb_search",
      phase: "outcome",
      outcome: "error",
    })]);
  });
});

describe("agent-tools production repository boundary", () => {
  it("denies anonymous member reads before opening the production database proxy", async () => {
    const loadDatabase = vi.fn(async () => {
      throw new Error("DATABASE_MUST_NOT_OPEN");
    });
    const repository = createAgentToolsRepository({loadDatabase});
    await expect(repository.getMemberContext(anonymousActor))
      .rejects.toThrow("AGENT_MEMBER_CONTEXT_DENIED");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("binds exact profile ownership and event visibility in production SQL", async () => {
    const statements: Array<{query: string; params: unknown[]}> = [];
    const proxy = drizzle(async (query, params) => {
      statements.push({query, params});
      return {rows: []};
    });
    const repository = createAgentToolsRepository({
      loadDatabase: async () => proxy as never,
    });

    await repository.getMemberContext(actor);
    await repository.listEvents(anonymousActor, {
      locale: "en",
      from: new Date("2026-07-27T00:00:00.000Z"),
      to: new Date("2027-07-27T00:00:00.000Z"),
      limit: 5,
    });
    await repository.listEvents(actor, {
      locale: "zh-HK",
      from: new Date("2026-07-27T00:00:00.000Z"),
      to: new Date("2027-07-27T00:00:00.000Z"),
      limit: 10,
    });

    expect(statements).toHaveLength(3);
    expect(statements[0]?.query).toMatch(
      /from "profiles".*where "profiles"\."id" = \$\d+.*limit 1/is,
    );
    expect(statements[0]?.params).toContain(profileId);
    expect(statements[1]?.query).toMatch(
      /where "events"\."published" = true.*"events"\."member_only" = false.*exists/is,
    );
    expect(statements[1]?.query).toMatch(
      /in \(\s*'active',\s*'past_due',\s*'cancel_at_period_end'\s*\)/is,
    );
    expect(statements[1]?.params).toEqual(expect.arrayContaining([null, 5]));
    expect(statements[2]?.params).toEqual(expect.arrayContaining([
      "zh-HK", profileId, 10,
    ]));
    expect(statements[1]?.query).not.toMatch(/capacity|created_at|updated_at/i);
  });

  it("derives distinct stable dedupe keys for follow-up and escalation actions", async () => {
    const dedupeKeys: string[] = [];
    const repository = createAgentToolsRepository({
      staffTasks: {
        createOnce: vi.fn(async (_actor, input) => {
          dedupeKeys.push(input.dedupeKey);
          return {
            disposition: "created" as const,
            record: {
              id: "55555555-5555-4555-8555-555555555555",
              profileId: input.profileId,
              journeyStateId: null,
              kind: input.kind,
              dedupeKey: input.dedupeKey,
              summaryCode: input.summaryCode,
              context: input.context ?? {},
              status: "open" as const,
            },
          };
        }) as never,
      },
    });
    const followUp = {
      profileId,
      kind: "concierge_general_follow_up",
      summaryCode: "provider_handoff" as const,
      reasonCode: "provider_handoff",
      locale: "en" as const,
    };
    const escalation = {
      profileId,
      kind: "concierge_escalation",
      summaryCode: "human_requested" as const,
      reasonCode: "human_requested",
      locale: "en" as const,
    };

    await repository.createStaffTask(actor, followUp);
    await repository.createStaffTask(actor, followUp);
    await repository.createStaffTask(actor, escalation);

    expect(dedupeKeys[0]).toBe(dedupeKeys[1]);
    expect(dedupeKeys[2]).not.toBe(dedupeKeys[0]);
    expect(dedupeKeys).toEqual([
      `agent-run:${runId}:concierge_general_follow_up:provider_handoff`,
      `agent-run:${runId}:concierge_general_follow_up:provider_handoff`,
      `agent-run:${runId}:concierge_escalation:human_requested`,
    ]);
  });
  it("uses narrow exact ownership/visibility SQL and no email send/log mutation", async () => {
    const source = await readFile(
      resolve(process.cwd(), "lib/db/repos/agent-tools.ts"),
      "utf8",
    );
    expect(source).toMatch(/profiles\.id.*actor\.profileId/s);
    expect(source).toMatch(/events\.published.*true/s);
    expect(source).toMatch(/events\.memberOnly.*false/s);
    expect(source).toMatch(/limit.*parsed\.limit/is);
    expect(source).not.toMatch(/emailLog|sendEmail|stripeCustomerId|stripeSubscriptionId/);
    expect(source).not.toMatch(/select\(\)\.from\(profiles\)/);
  });
});
