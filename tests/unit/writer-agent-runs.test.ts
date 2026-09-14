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
  it("persists the request profile and no conversation", async () => {
    const {database, statements} = recordingDatabase();
    const repository = createAgentRunsRepository(async () => database);
    await repository.start(writer, {provider: null, model: null});
    const sql = statements[0]!.sql.toLowerCase();
    expect(sql).toContain('insert into "agent_runs"');
    // Drizzle quotes identifiers, so the unquoted `from conversations` this
    // used to assert against could never match — the negative was vacuous.
    // The writer actor takes the self-contained `INSERT … VALUES` arm; the
    // concierge arm is `INSERT … SELECT … FROM "conversations"` and is
    // ownership-guarded. Assert the discriminating shape, quoted.
    expect(sql).toMatch(/insert into "agent_runs"[\s\S]*values/i);
    expect(sql).not.toMatch(/from "conversations"/i);
    expect(statements[0]!.params).toContain("writer");
    expect(statements[0]!.params).toContain("profile-9");
    expect(statements[0]!.params).toContain("portal");
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
