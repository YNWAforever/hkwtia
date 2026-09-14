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
    expect(sql).not.toContain("from conversations");
    expect(statements[0]!.params).toContain("writer");
    expect(statements[0]!.params).toContain("profile-9");
    expect(statements[0]!.params).toContain("portal");
  });

  it("counts a member's writer runs since a timestamp", async () => {
    const execute = vi.fn(async () => [{count: 3}]);
    const repository = createAgentRunsRepository(async () => ({execute} as never));
    await expect(repository.countWriterRuns(
      {kind: "member", userId: "u1", profileId: "profile-9"},
      new Date("2026-09-01T00:00:00Z"),
    )).resolves.toBe(3);
  });

  it("refuses a non-member actor for the count", async () => {
    const repository = createAgentRunsRepository(async () => ({execute: vi.fn()} as never));
    await expect(repository.countWriterRuns(
      {kind: "anonymous", userId: null},
      new Date(),
    )).rejects.toThrow("FORBIDDEN");
  });
});
