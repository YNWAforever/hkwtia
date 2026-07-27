import {PgDialect} from "drizzle-orm/pg-core";
import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";
import {
  createConversationsRepository,
  type ConversationOwner,
} from "@/lib/db/repos/conversations";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const dialect = new PgDialect();
const now = new Date("2027-04-10T10:00:00.000Z");
const completedAt = new Date("2027-04-10T10:00:01.250Z");
const conversationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const profileOwner: ConversationOwner = {kind: "profile", profileId: "profile-1"};
const otherOwner: ConversationOwner = {kind: "profile", profileId: "profile-2"};
const anonymousOwner: ConversationOwner = {
  kind: "anonymous",
  anonymousOwnerHash: "a".repeat(64),
};
const otherAnonymousOwner: ConversationOwner = {
  kind: "anonymous",
  anonymousOwnerHash: "b".repeat(64),
};
const agent: ConciergeAgentActor = {
  kind: "agent",
  agent: "concierge",
  runId,
  conversationId,
  profileId: "profile-1",
  trigger: "web",
};

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    profile_id: "profile-1",
    anonymous_owner_hash: null,
    locale: "en",
    status: "active",
    last_message_at: null,
    expires_at: new Date("2027-04-11T10:00:00.000Z"),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    conversation_id: conversationId,
    role: "user",
    channel: "web",
    content: "Hello",
    provider_message_id: null,
    metadata: {},
    citations: [],
    created_at: now,
    disposition: "created",
    ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    conversation_id: conversationId,
    profile_id: "profile-1",
    trigger: "web",
    status: "running",
    provider: "openai",
    model: "gpt-test",
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

function sequenceDatabase(responses: Record<string, unknown>[][]) {
  const commands: Array<{sql: string; params: unknown[]}> = [];
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    const command = dialect.sqlToQuery(query);
    commands.push({
      sql: command.sql.replace(/\s+/g, " ").trim(),
      params: [...command.params],
    });
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work({execute}),
  };
  return {commands, database};
}

describe("AI conversation repository", () => {
  it.each([
    [profileOwner, conversationRow()],
    [
      anonymousOwner,
      conversationRow({
        profile_id: null,
        anonymous_owner_hash: anonymousOwner.anonymousOwnerHash,
      }),
    ],
  ] as const)("creates exactly one owner form for %o", async (owner, row) => {
    const fake = sequenceDatabase([[row]]);
    const repository = createConversationsRepository(async () => fake.database);

    await expect(repository.create(owner, {
      locale: "en",
      expiresAt: row.expires_at,
    })).resolves.toMatchObject({
      id: conversationId,
      profileId: row.profile_id,
      anonymousOwnerHash: row.anonymous_owner_hash,
    });

    expect(fake.commands[0]?.sql).toMatch(/INSERT INTO "conversations"/i);
    expect(fake.commands[0]?.params).toContain(row.profile_id);
    expect(fake.commands[0]?.params).toContain(row.anonymous_owner_hash);
  });

  it.each([
    [profileOwner, otherOwner],
    [anonymousOwner, otherAnonymousOwner],
  ] as const)("denies cross-owner reads for %o", async (owner, deniedOwner) => {
    const allowed = sequenceDatabase([[conversationRow()]]);
    await expect(
      createConversationsRepository(async () => allowed.database)
        .getOwned(owner, conversationId),
    ).resolves.toMatchObject({id: conversationId});

    const denied = sequenceDatabase([[]]);
    await expect(
      createConversationsRepository(async () => denied.database)
        .getOwned(deniedOwner, conversationId),
    ).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(denied.commands[0]?.sql).toMatch(/WHERE .*id.*profile_id|WHERE .*id.*anonymous_owner_hash/i);
  });

  it("appends provider messages idempotently without leaking cross-conversation rows", async () => {
    const providerMessageId = "provider-message-1";
    const created = sequenceDatabase([
      [conversationRow()],
      [messageRow({provider_message_id: providerMessageId})],
    ]);
    const repository = createConversationsRepository(async () => created.database);
    await expect(repository.appendMessage(profileOwner, conversationId, {
      role: "user",
      channel: "web",
      content: "Hello",
      providerMessageId,
    })).resolves.toMatchObject({disposition: "created"});
    expect(created.commands[1]?.sql).toMatch(/ON CONFLICT.*provider_message_id.*DO NOTHING/i);

    const existing = sequenceDatabase([
      [conversationRow()],
      [messageRow({provider_message_id: providerMessageId, disposition: "existing"})],
    ]);
    await expect(
      createConversationsRepository(async () => existing.database)
        .appendMessage(profileOwner, conversationId, {
          role: "user",
          channel: "web",
          content: "Hello again",
          providerMessageId,
        }),
    ).resolves.toMatchObject({disposition: "existing"});
    expect(existing.commands[1]?.sql).toMatch(/conversation_id.*provider_message_id/i);
  });

  it("lists messages only after an ownership check", async () => {
    const allowed = sequenceDatabase([
      [conversationRow()],
      [messageRow()],
    ]);
    await expect(
      createConversationsRepository(async () => allowed.database)
        .listMessages(profileOwner, conversationId),
    ).resolves.toMatchObject([{content: "Hello"}]);

    const denied = sequenceDatabase([[]]);
    await expect(
      createConversationsRepository(async () => denied.database)
        .listMessages(otherOwner, conversationId),
    ).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(denied.commands).toHaveLength(1);
  });

  it("deletes expired conversations only as a bounded system batch", async () => {
    const system = {kind: "system", userId: null, source: "automation-cron"} as const;
    const fake = sequenceDatabase([[{id: conversationId}]]);
    const repository = createConversationsRepository(async () => fake.database);

    await expect(repository.deleteExpired(system, {
      asOf: now,
      limit: 25,
    })).resolves.toBe(1);
    expect(fake.commands[0]?.sql).toMatch(/expires_at.*LIMIT.*FOR UPDATE SKIP LOCKED/i);
    expect(fake.commands[0]?.sql).toMatch(/DELETE FROM "conversations"/i);

    let databaseLoads = 0;
    const denied = createConversationsRepository(async () => {
      databaseLoads += 1;
      return sequenceDatabase([]).database;
    });
    await expect(denied.deleteExpired({
      kind: "member",
      userId: "member-1",
      profileId: "profile-1",
    } as never, {asOf: now, limit: 25})).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(databaseLoads).toBe(0);
  });
});

describe("agent-run repository lifecycle", () => {
  it("starts the exact actor-bound run and finishes only from running with persisted latency", async () => {
    const fake = sequenceDatabase([
      [runRow()],
      [runRow({
        status: "completed",
        completed_at: completedAt,
        latency_ms: 1_250,
        input_tokens: 12,
        output_tokens: 6,
        cost_usd: "0.001200",
        summary: "Contact [redacted-email] at [redacted-phone]",
      })],
    ]);
    const repository = createAgentRunsRepository(async () => fake.database);

    await expect(repository.start(agent, {
      provider: "openai",
      model: "gpt-test",
      startedAt: now,
    })).resolves.toMatchObject({id: runId, status: "running"});
    await expect(repository.finish(agent, {
      completedAt,
      inputTokens: 12,
      outputTokens: 6,
      costUsd: "0.001200",
      summary: "Contact person@example.com at +852 9123 4567",
    })).resolves.toMatchObject({
      status: "completed",
      latencyMs: 1_250,
      summary: "Contact [redacted-email] at [redacted-phone]",
    });
    expect(fake.commands[1]?.sql).toMatch(/status = 'completed'.*status = 'running'/i);
    expect(fake.commands[1]?.sql).toMatch(/started_at/i);
    expect(fake.commands[1]?.params).not.toContain("person@example.com");
    expect(fake.commands[1]?.params).not.toContain("+852 9123 4567");
  });

  it.each([
    ["failed", "fail", {errorCode: "provider_error"}],
    ["escalated", "escalate", {summary: "Needs staff follow-up"}],
    ["disabled", "disable", {summary: "Feature disabled"}],
  ] as const)("supports running -> %s and rejects an already-terminal run", async (status, method, extra) => {
    const transitioned = sequenceDatabase([[
      runRow({status, completed_at: completedAt, latency_ms: 1_250, ...(
        "errorCode" in extra ? {error_code: extra.errorCode} : {summary: extra.summary}
      )}),
    ]]);
    const repository = createAgentRunsRepository(async () => transitioned.database);
    await expect(repository[method](agent, {completedAt, ...extra}))
      .resolves.toMatchObject({status});
    expect(transitioned.commands[0]?.sql).toMatch(
      new RegExp("status = '" + status + "'.*status = 'running'", "i"),
    );

    const rejected = sequenceDatabase([[]]);
    await expect(
      createAgentRunsRepository(async () => rejected.database)[method](
        agent,
        {completedAt, ...extra},
      ),
    ).rejects.toThrow("INVALID_AGENT_RUN_TRANSITION");
  });

  it("records CSAT only through conversation ownership", async () => {
    const updated = sequenceDatabase([[runRow({status: "completed", csat_score: 5})]]);
    await expect(
      createAgentRunsRepository(async () => updated.database)
        .recordFeedback(profileOwner, runId, 5),
    ).resolves.toMatchObject({csatScore: 5});
    expect(updated.commands[0]?.sql).toMatch(/UPDATE "agent_runs".*"conversations"/i);
    expect(updated.commands[0]?.sql).toMatch(/profile_id/i);

    const denied = sequenceDatabase([[]]);
    await expect(
      createAgentRunsRepository(async () => denied.database)
        .recordFeedback(otherOwner, runId, 5),
    ).rejects.toMatchObject({code: "FORBIDDEN"});
  });

  it("redacts auth tokens, cookies, and webhook signatures from summaries", async () => {
    const fake = sequenceDatabase([[
      runRow({
        status: "completed",
        completed_at: completedAt,
        latency_ms: 1_250,
        summary: "Authorization=[redacted-secret] Cookie=[redacted-secret] webhook_signature=[redacted-secret]",
      }),
    ]]);
    const sensitive = [
      "Bearer sk-secret-token-123456",
      "session=private-cookie-123456",
      "whsec_private-webhook-123456",
    ];
    await createAgentRunsRepository(async () => fake.database).finish(agent, {
      completedAt,
      summary: "Authorization: " + sensitive[0]
        + " Cookie: " + sensitive[1]
        + " webhook_signature=" + sensitive[2],
    });

    const persisted = JSON.stringify(fake.commands[0]?.params);
    for (const secret of sensitive) expect(persisted).not.toContain(secret);
    expect(persisted).toContain("[redacted-secret]");
  });

  it("records CSAT for the matching anonymous hash and denies another hash", async () => {
    const updated = sequenceDatabase([[runRow({
      profile_id: null,
      status: "completed",
      csat_score: 4,
    })]]);
    await expect(
      createAgentRunsRepository(async () => updated.database)
        .recordFeedback(anonymousOwner, runId, 4),
    ).resolves.toMatchObject({csatScore: 4});
    expect(updated.commands[0]?.sql).toMatch(/anonymous_owner_hash/i);

    const denied = sequenceDatabase([[]]);
    await expect(
      createAgentRunsRepository(async () => denied.database)
        .recordFeedback(otherAnonymousOwner, runId, 4),
    ).rejects.toMatchObject({code: "FORBIDDEN"});
  });
});

describe("agent staff-task escalation repository", () => {
  const anonymousAgent: ConciergeAgentActor = {
    ...agent,
    profileId: null,
  };
  const context = {
    contactEmail: "guest@example.com",
    conversationId,
    agentRunId: runId,
    reasonCode: "human_requested",
    locale: "en" as const,
  };

  it("allows a nullable-profile Concierge escalation with strict bounded context", async () => {
    const row = {
      id: "55555555-5555-4555-8555-555555555555",
      profile_id: null,
      journey_state_id: null,
      kind: "concierge_escalation",
      dedupe_key: "agent-run:" + runId,
      summary_code: "Contact [redacted-email] at [redacted-phone]",
      context,
      status: "open",
    };
    const fake = sequenceDatabase([[row]]);
    const repository = createStaffTasksRepository(async () => fake.database);

    await expect(repository.createOnce(anonymousAgent, {
      profileId: null,
      journeyStateId: null,
      kind: "concierge_escalation",
      dedupeKey: "agent-run:" + runId,
      summaryCode: "Contact guest@example.com at +852 9123 4567",
      context,
    })).resolves.toMatchObject({
      disposition: "created",
      record: {profileId: null, context},
    });

    expect(fake.commands[0]?.params).not.toContain("guest@example.com at +852 9123 4567");
    expect(fake.commands[0]?.params).toContain("Contact [redacted-email] at [redacted-phone]");
  });

  it("rejects wrong actor context, unknown context keys, and oversized context before database access", async () => {
    let databaseLoads = 0;
    const repository = createStaffTasksRepository(async () => {
      databaseLoads += 1;
      return sequenceDatabase([]).database;
    });
    const base = {
      profileId: null,
      journeyStateId: null,
      kind: "concierge_escalation",
      dedupeKey: "agent-run:" + runId,
      summaryCode: "human_requested",
    };

    await expect(repository.createOnce(anonymousAgent, {
      ...base,
      context: {...context, conversationId: "66666666-6666-4666-8666-666666666666"},
    })).rejects.toThrow("INVALID_AGENT_STAFF_TASK");
    await expect(repository.createOnce(anonymousAgent, {
      ...base,
      context: {...context, privateTranscript: "must not persist"},
    } as never)).rejects.toThrow();
    await expect(repository.createOnce(anonymousAgent, {
      ...base,
      context: {...context, reasonCode: "x".repeat(4_097)},
    })).rejects.toThrow();
    expect(databaseLoads).toBe(0);
  });

  it("preserves M3 automation input defaults and requires its existing profile", async () => {
    const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
    const fake = sequenceDatabase([]);
    const repository = createStaffTasksRepository(async () => fake.database);
    await expect(repository.createOnce(system, {
      profileId: null,
      journeyStateId: null,
      kind: "automation",
      dedupeKey: "automation:missing-profile",
      summaryCode: "automation",
    } as never)).rejects.toThrow("AUTOMATION_STAFF_TASK_PROFILE_REQUIRED");
    expect(fake.commands).toEqual([]);
  });

  it("does not return another task when an agent dedupe key collides", async () => {
    const otherContext = {
      ...context,
      conversationId: "99999999-9999-4999-8999-999999999999",
      agentRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const fake = sequenceDatabase([
      [],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        profile_id: "other-profile",
        journey_state_id: null,
        kind: "concierge_escalation",
        dedupe_key: "agent-run:" + runId,
        summary_code: "other_summary",
        context: otherContext,
        status: "open",
      }],
    ]);

    await expect(
      createStaffTasksRepository(async () => fake.database)
        .createOnce(anonymousAgent, {
          profileId: null,
          journeyStateId: null,
          kind: "concierge_escalation",
          dedupeKey: "agent-run:" + runId,
          summaryCode: "human_requested",
          context,
        }),
    ).rejects.toThrow("STAFF_TASK_DEDUPE_CONFLICT");
    expect(fake.commands[1]?.sql).toMatch(/conversationId|conversation_id/i);
    expect(fake.commands[1]?.sql).toMatch(/agentRunId|agent_run_id/i);
  });
});

describe("draft-email approval repository proxy", () => {
  it("persists only a pending agent.draft_email approval", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (query, params) => {
      statements.push({sql: query, params});
      return {
        rows: [[
          "44444444-4444-4444-8444-444444444444",
          "pending",
          now,
        ]],
      };
    });
    const {createApprovalsRepository} = await import("@/lib/db/repos/approvals");
    const repository = createApprovalsRepository(async () => database as never);

    await expect(repository.createDraftEmail(agent, {
      to: "member@example.com",
      subject: "Follow-up",
      text: "Draft text",
      locale: "en",
      conversationId,
      agentRunId: runId,
    })).resolves.toMatchObject({status: "pending"});

    expect(statements[0]?.sql).toMatch(/insert into "approvals"/i);
    expect(statements[0]?.params).toContain("agent.draft_email");
    expect(statements[0]?.params).toContain("pending");
    expect(statements[0]?.params).not.toContain("approved");
    expect(statements[0]?.params).not.toContain("rejected");
  });

  it("rejects extra payload fields and mismatched actor context before database access", async () => {
    const loadDatabase = async () => {
      throw new Error("DATABASE_MUST_NOT_OPEN");
    };
    const {createApprovalsRepository} = await import("@/lib/db/repos/approvals");
    const repository = createApprovalsRepository(loadDatabase);
    const payload = {
      to: "member@example.com",
      subject: "Follow-up",
      text: "Draft text",
      locale: "en" as const,
      conversationId,
      agentRunId: runId,
    };

    await expect(repository.createDraftEmail(agent, {
      ...payload,
      status: "approved",
    } as never)).rejects.not.toThrow("DATABASE_MUST_NOT_OPEN");
    await expect(repository.createDraftEmail(agent, {
      ...payload,
      conversationId: "77777777-7777-4777-8777-777777777777",
    })).rejects.toThrow("INVALID_AGENT_APPROVAL_CONTEXT");
    await expect(repository.createDraftEmail(agent, {
      ...payload,
      agentRunId: "88888888-8888-4888-8888-888888888888",
    })).rejects.toThrow("INVALID_AGENT_APPROVAL_CONTEXT");
  });
});
