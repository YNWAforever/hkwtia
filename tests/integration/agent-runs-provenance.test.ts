import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {ConciergeAgentActor, ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";

const now = new Date("2027-04-10T10:00:00.000Z");
const actor: ConciergeAgentActor = {
  kind: "agent",
  agent: "concierge",
  runId: "22222222-2222-4222-8222-222222222222",
  conversationId: "11111111-1111-4111-8111-111111111111",
  profileId: "profile-1",
  trigger: "web",
};

const scheduledActor: ScheduledAgentActor = {
  kind: "agent",
  agent: "retention_analyst",
  runId: "33333333-3333-4333-8333-333333333333",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: actor.runId,
    agent: actor.agent,
    conversation_id: actor.conversationId,
    profile_id: actor.profileId,
    trigger: actor.trigger,
    status: "running",
    provider: "openai",
    model: "gpt-4.1-mini",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: "0",
    latency_ms: null,
    summary: null,
    error_code: null,
    csat_score: null,
    started_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function normalizedSql(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("agent-run model provenance", () => {
  it("configures only the exact actor-bound null-provenance running row once", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    let call = 0;
    const database = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      call += 1;
      return {rows: call === 1 ? [runRow()] : []};
    });
    const repository = createAgentRunsRepository(
      async () => database as unknown as AutomationDatabase,
    );

    await expect(repository.configureModel(actor, {
      provider: "openai",
      model: "gpt-4.1-mini",
    })).resolves.toMatchObject({
      id: actor.runId,
      status: "running",
      provider: "openai",
      model: "gpt-4.1-mini",
    });
    await expect(repository.configureModel(actor, {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    })).rejects.toThrow("INVALID_AGENT_RUN_MODEL_CONFIGURATION");

    expect(statements).toHaveLength(2);
    const updateSql = normalizedSql(statements[0]);
    expect(updateSql).toMatch(/^update "agent_runs" set provider =/);
    expect(updateSql).toMatch(
      /where .*id =.*agent =.*conversation_id =.*profile_id is not distinct from.*trigger =.*status = 'running'/,
    );
    expect(updateSql).toMatch(/provider is null.*model is null/);
    expect(parameters[0]).toEqual(expect.arrayContaining([
      actor.runId,
      actor.agent,
      actor.conversationId,
      actor.profileId,
      actor.trigger,
      "openai",
      "gpt-4.1-mini",
    ]));
  });

  it("authorizes before provenance validation or database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createAgentRunsRepository(loadDatabase);

    await expect(repository.configureModel(
      {kind: "member"} as never,
      {provider: "provider secret", model: ""},
    )).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("rejects invalid provenance before database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createAgentRunsRepository(loadDatabase);

    await expect(repository.configureModel(actor, {
      provider: "provider secret",
      model: '{"token":"secret"}',
    })).rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("starts a scheduled run with exact identity and an optional acceptance marker", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    const database = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: [runRow({
        id: scheduledActor.runId,
        agent: scheduledActor.agent,
        conversation_id: null,
        profile_id: null,
        trigger: "scheduled",
        provider: null,
        model: null,
        summary: "m4b-acceptance-owner:m4b-acceptance-v1",
      })]};
    });
    const repository = createAgentRunsRepository(
      async () => database as unknown as AutomationDatabase,
    );

    await expect(repository.start(scheduledActor, {
      startedAt: now,
      acceptanceOwnershipKey: "m4b-acceptance-v1",
    })).resolves.toMatchObject({
      id: scheduledActor.runId,
      agent: "retention_analyst",
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
      status: "running",
      summary: "m4b-acceptance-owner:m4b-acceptance-v1",
    });

    const insertSql = normalizedSql(statements[0]);
    expect(insertSql).toMatch(/^insert into "agent_runs"/);
    expect(insertSql).toMatch(/\(\s*id, agent, conversation_id, profile_id, trigger/);
    expect(insertSql).not.toContain("from \"conversations\"");
    expect(parameters[0]).toEqual(expect.arrayContaining([
      scheduledActor.runId,
      scheduledActor.agent,
      null,
      "scheduled",
      "m4b-acceptance-owner:m4b-acceptance-v1",
    ]));
  });

  it("binds finalization to the exact scheduled agent and run identity", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    const database = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: []};
    });
    const repository = createAgentRunsRepository(
      async () => database as unknown as AutomationDatabase,
    );
    const wrongIdentity = {...scheduledActor, agent: "board_reporter" as const};

    await expect(repository.finish(wrongIdentity, {
      completedAt: now,
      summaryCode: "answered",
      inputTokens: 2,
      outputTokens: 3,
      costUsd: "0.01",
    })).rejects.toThrow("INVALID_AGENT_RUN_TRANSITION");

    const updateSql = normalizedSql(statements[0]);
    expect(updateSql).toMatch(
      /where .*id =.*agent =.*conversation_id is null.*profile_id is null.*trigger =.*status = 'running'/,
    );
    expect(parameters[0]).toEqual(expect.arrayContaining([
      scheduledActor.runId,
      "board_reporter",
      "scheduled",
    ]));
  });
});
