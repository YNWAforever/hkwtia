import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import {
  createConversationsRepository,
  type ConversationOwner,
} from "@/lib/db/repos/conversations";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const dialect = new PgDialect();
const now = new Date("2026-07-28T01:00:00.000Z");
const conversationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const owner = {
  kind: "profile",
  profileId: "profile-1",
} as const satisfies ConversationOwner;
const actor: ConciergeAgentActor = {
  kind: "agent",
  agent: "concierge",
  runId,
  conversationId,
  profileId: owner.profileId,
  trigger: "web",
};

function conversationRow() {
  return {
    id: conversationId,
    profile_id: owner.profileId,
    anonymous_owner_hash: null,
    locale: "en",
    status: "active",
    last_message_at: null,
    expires_at: new Date("2026-07-29T01:00:00.000Z"),
    created_at: now,
    updated_at: now,
  };
}

function messageRow() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    conversation_id: conversationId,
    role: "user",
    channel: "web",
    content: "What is WTIA?",
    provider_message_id: null,
    metadata: {locale: "en"},
    citations: [],
    created_at: now,
    disposition: "created",
  };
}

function runRow() {
  return {
    id: runId,
    conversation_id: conversationId,
    profile_id: owner.profileId,
    trigger: "web",
    status: "running",
    provider: null,
    model: null,
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
  };
}

function transactionalDatabase(responses: Record<string, unknown>[][]) {
  const commands: Array<{sql: string; params: unknown[]}> = [];
  const execute = vi.fn(async (
    query: Parameters<AutomationSqlExecutor["execute"]>[0],
  ) => {
    const command = dialect.sqlToQuery(query);
    commands.push({
      sql: command.sql.replace(/\s+/g, " ").trim(),
      params: [...command.params],
    });
    return {rows: responses.shift() ?? []};
  });
  let committed = false;
  let rolledBack = false;
  let transactionCalls = 0;
  async function transaction<T>(
    work: (executor: AutomationSqlExecutor) => Promise<T>,
  ): Promise<T> {
    transactionCalls += 1;
    try {
      const result = await work({execute});
      committed = true;
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  }
  const database: AutomationDatabase = {execute, transaction};
  return {
    commands,
    database,
    state: {
      get committed() {
        return committed;
      },
      get transactionCalls() {
        return transactionCalls;
      },
      get rolledBack() {
        return rolledBack;
      },
    },
  };
}

type AtomicStartRepository = Readonly<{
  startAgentTurn: (
    owner: ConversationOwner,
    actor: ConciergeAgentActor,
    message: unknown,
    input: unknown,
  ) => Promise<unknown>;
}>;

function atomicRepository(
  database: AutomationDatabase,
): AtomicStartRepository {
  return createConversationsRepository(
    async () => database,
  ) as unknown as AtomicStartRepository;
}

describe("Concierge atomic repository start", () => {
  it("persists the user message and running agent run in one transaction", async () => {
    const fake = transactionalDatabase([
      [conversationRow()],
      [messageRow()],
      [],
      [runRow()],
    ]);

    await expect(atomicRepository(fake.database).startAgentTurn(
      owner,
      actor,
      {
        role: "user",
        channel: "web",
        content: "What is WTIA?",
        metadata: {locale: "en"},
        citations: [],
      },
      {startedAt: now},
    )).resolves.toMatchObject({
      message: {content: "What is WTIA?"},
      run: {id: runId, status: "running"},
    });

    expect(fake.state.transactionCalls).toBe(1);
    expect(fake.state.committed).toBe(true);
    expect(fake.commands.map((command) => command.sql)).toEqual([
      expect.stringMatching(/SELECT .* FROM "conversations".*profile_id/i),
      expect.stringMatching(/INSERT INTO "messages"/i),
      expect.stringMatching(/UPDATE "conversations"/i),
      expect.stringMatching(/INSERT INTO "agent_runs"/i),
    ]);
    expect(fake.commands[3]?.sql).toMatch(/SELECT .* FROM "conversations"/i);
    expect(fake.commands[3]?.params).toEqual(expect.arrayContaining([
      runId,
      conversationId,
      owner.profileId,
      "web",
      now,
    ]));
  });

  it("rolls back the message when the running agent-run insert fails", async () => {
    const fake = transactionalDatabase([
      [conversationRow()],
      [messageRow()],
      [],
      [],
    ]);

    await expect(atomicRepository(fake.database).startAgentTurn(
      owner,
      actor,
      {
        role: "user",
        channel: "web",
        content: "What is WTIA?",
      },
      {startedAt: now},
    )).rejects.toBeTruthy();

    expect(fake.state.transactionCalls).toBe(1);
    expect(fake.state.committed).toBe(false);
    expect(fake.state.rolledBack).toBe(true);
    expect(fake.commands.at(-1)?.sql).toMatch(/INSERT INTO "agent_runs"/i);
  });
});
