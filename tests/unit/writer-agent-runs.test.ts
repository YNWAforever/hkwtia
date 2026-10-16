import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {WriterAgentActor} from "@/lib/auth/agent-actor";
import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";

const dialect = new PgDialect();

const writer: WriterAgentActor = {
  kind: "agent",
  agent: "writer",
  runId: "22222222-2222-4222-8222-222222222222",
  conversationId: null,
  profileId: "profile-9",
  trigger: "portal",
};

function recordingDatabase(responses: readonly Record<string, unknown>[][] = []) {
  const statements: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const queue = [...responses];
  const execute = vi.fn(async (query: never) => {
    statements.push(dialect.sqlToQuery(query));
    return queue.shift() ?? [{id: writer.runId, agent: "writer", conversation_id: null, profile_id: "profile-9", trigger: "portal", status: "running", input_tokens: 0, output_tokens: 0, cost_usd: "0", started_at: new Date(), created_at: new Date(), updated_at: new Date()}];
  });
  return {statements, execute, database: {execute} as never};
}

describe("agentRunsRepository writer runs", () => {
  it("locks the member, recounts, and inserts the writer run in one transaction", async () => {
    const statements: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const transaction = vi.fn(async (work: (tx: {execute: (query: never) => Promise<unknown>}) => Promise<unknown>) =>
      work({execute: async (query) => {
        const statement = dialect.sqlToQuery(query);
        statements.push(statement);
        if (/for update/i.test(statement.sql)) return [{id: "profile-9"}];
        if (/count\(\*\)/i.test(statement.sql)) return [{count: 19}];
        return [{id: writer.runId}];
      }}));
    const repository = createAgentRunsRepository(async () => ({transaction, execute: vi.fn()} as never));
    const startedAt = new Date("2026-09-14T04:00:00Z");
    const runId = await repository.reserveWriterRun(
      {kind: "member", userId: "u1", profileId: "profile-9"},
      {cap: 20, startedAt},
    );
    expect(runId).toBeTruthy();
    expect(transaction).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(3);
    expect(statements[0]!.sql).toMatch(/from "profiles"[\s\S]*for update/i);
    expect(statements[0]!.params).toContain("profile-9");
    expect(statements[1]!.sql).toMatch(/from "agent_runs"[\s\S]*agent = 'writer'[\s\S]*profile_id =/i);
    expect(statements[1]!.params).toContain("profile-9");
    expect(statements[1]!.params).toContainEqual(new Date("2026-08-31T16:00:00Z"));
    expect(statements[2]!.sql).toMatch(/insert into "agent_runs"[\s\S]*returning id/i);
    expect(statements[2]!.params).toContain("profile-9");
  });

  it("does not insert a run when the locked recount reaches the cap", async () => {
    const statements: string[] = [];
    const transaction = vi.fn(async (work: (tx: {execute: (query: never) => Promise<unknown>}) => Promise<unknown>) =>
      work({execute: async (query) => {
        const statement = dialect.sqlToQuery(query);
        statements.push(statement.sql);
        return /for update/i.test(statement.sql) ? [{id: "profile-9"}] : [{count: 20}];
      }}));
    const repository = createAgentRunsRepository(async () => ({transaction, execute: vi.fn()} as never));
    await expect(repository.reserveWriterRun(
      {kind: "member", userId: "u1", profileId: "profile-9"},
      {cap: 20, startedAt: new Date("2026-09-14T04:00:00Z")},
    )).resolves.toBeNull();
    expect(statements).toHaveLength(2);
    expect(statements.some((statement) => /insert into/i.test(statement))).toBe(false);
  });

  it("refuses a non-member reservation and an unmetered writer start before opening the database", async () => {
    const loadDatabase = vi.fn(async () => { throw new Error("database should not open"); });
    const repository = createAgentRunsRepository(loadDatabase);
    await expect(repository.reserveWriterRun(
      {kind: "anonymous", userId: null},
      {cap: 20, startedAt: new Date()},
    )).rejects.toThrow("FORBIDDEN");
    await expect(repository.start(writer, {provider: null, model: null})).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("counts a member's writer runs since a timestamp", async () => {
    const {database, statements} = recordingDatabase([[{count: 3}]]);
    const repository = createAgentRunsRepository(async () => database);
    await expect(repository.countWriterRuns(
      {kind: "member", userId: "u1", profileId: "profile-9"},
      new Date("2026-09-01T00:00:00Z"),
    )).resolves.toBe(3);
    // The resolved number is not evidence the query scoped to the actor: a
    // regression that dropped `AND profile_id = …` would count every member's
    // runs toward this member's quota and still resolve `3` from this fake.
    // Assert the emitted statement carries both scopes and the actor's id.
    expect(statements).toHaveLength(1);
    const normalized = statements[0]!.sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toMatch(/from "agent_runs"/);
    expect(normalized).toMatch(/agent = 'writer'/);
    expect(normalized).toMatch(/profile_id = \$1/);
    expect(statements[0]!.params).toContain("profile-9");
  });

  it("refuses a non-member actor for the count", async () => {
    const {database, execute} = recordingDatabase();
    const repository = createAgentRunsRepository(async () => database);
    await expect(repository.countWriterRuns(
      {kind: "anonymous", userId: null},
      new Date(),
    )).rejects.toThrow("FORBIDDEN");
    // `requireMember` fires before `loadDatabase`/`execute`, so the guard — not
    // a downstream query — is what rejected the actor.
    expect(execute).not.toHaveBeenCalled();
  });
});
