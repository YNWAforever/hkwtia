import {readFileSync} from "node:fs";

import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  chatRetentionCutoff,
  createChatRetentionRepository,
  runChatRetention,
  type ChatRetentionRepository,
} from "@/lib/ai/retention";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const now = new Date("2026-07-28T03:00:00.000Z");

function repository(
  overrides: Partial<ChatRetentionRepository> = {},
): ChatRetentionRepository {
  return {
    inspect: vi.fn(async () => ({
      messages: 0,
      runsToRedact: 0,
      runsToUnlink: 0,
      emptyConversations: 0,
    })),
    redactRunsBatch: vi.fn(async () => 0),
    deleteMessagesBatch: vi.fn(async () => 0),
    removeEmptyConversationsBatch: vi.fn(async () => ({
      conversationsDeleted: 0,
      runsUnlinked: 0,
      runsRedacted: 0,
    })),
    ...overrides,
  };
}

describe("chat transcript retention", () => {
  it("uses an exact 12-calendar-month cutoff and retains the boundary instant", async () => {
    expect(chatRetentionCutoff(now)).toEqual(
      new Date("2025-07-28T03:00:00.000Z"),
    );
    expect(
      chatRetentionCutoff(new Date("2024-02-29T12:30:00.000Z")),
    ).toEqual(new Date("2023-02-28T12:30:00.000Z"));

    const observed: Date[] = [];
    const repo = repository({
      deleteMessagesBatch: vi.fn(async (cutoff) => {
        observed.push(cutoff);
        const messageTimes = [
          new Date("2025-07-28T02:59:59.999Z"),
          new Date("2025-07-28T03:00:00.000Z"),
        ];
        return messageTimes.filter((createdAt) => createdAt < cutoff).length;
      }),
    });

    await expect(runChatRetention({repository: repo, now})).resolves
      .toMatchObject({messagesDeleted: 1});
    expect(observed).toEqual([new Date("2025-07-28T03:00:00.000Z")]);
  });

  it("repeats each bounded cleanup phase until fewer than the batch size remain", async () => {
    const redactRunsBatch = vi.fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const deleteMessagesBatch = vi.fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const removeEmptyConversationsBatch = vi.fn()
      .mockResolvedValueOnce({
        conversationsDeleted: 2,
        runsUnlinked: 3,
        runsRedacted: 1,
      })
      .mockResolvedValueOnce({
        conversationsDeleted: 1,
        runsUnlinked: 1,
        runsRedacted: 0,
      });
    const repo = repository({
      redactRunsBatch,
      deleteMessagesBatch,
      removeEmptyConversationsBatch,
    });

    await expect(runChatRetention({
      repository: repo,
      now,
      batchSize: 2,
      maxBatches: 10,
    })).resolves.toEqual({
      dryRun: false,
      messagesDeleted: 5,
      runsRedacted: 4,
      runsUnlinked: 4,
      conversationsDeleted: 3,
      batches: 7,
      truncated: false,
    });
    expect(redactRunsBatch).toHaveBeenCalledTimes(2);
    expect(deleteMessagesBatch).toHaveBeenCalledTimes(3);
    expect(removeEmptyConversationsBatch).toHaveBeenCalledTimes(2);
    expect(deleteMessagesBatch).toHaveBeenCalledWith(
      new Date("2025-07-28T03:00:00.000Z"),
      2,
    );
    expect(removeEmptyConversationsBatch).toHaveBeenCalledWith(now, 2);
  });

  it("reports a dry run without invoking any mutating repository method", async () => {
    const repo = repository({
      inspect: vi.fn(async (cutoff, inspectedNow) => {
        expect(cutoff).toEqual(new Date("2025-07-28T03:00:00.000Z"));
        expect(inspectedNow).toEqual(now);
        return {
          messages: 12,
          runsToRedact: 4,
          runsToUnlink: 3,
          emptyConversations: 2,
        };
      }),
    });

    await expect(runChatRetention({
      repository: repo,
      now,
      dryRun: true,
    })).resolves.toEqual({
      dryRun: true,
      messagesDeleted: 12,
      runsRedacted: 4,
      runsUnlinked: 3,
      conversationsDeleted: 2,
      batches: 0,
      truncated: false,
    });
    expect(repo.redactRunsBatch).not.toHaveBeenCalled();
    expect(repo.deleteMessagesBatch).not.toHaveBeenCalled();
    expect(repo.removeEmptyConversationsBatch).not.toHaveBeenCalled();
  });

  it("stops at the configured maximum instead of allowing an unbounded purge", async () => {
    const repo = repository({
      redactRunsBatch: vi.fn(async () => 2),
    });

    await expect(runChatRetention({
      repository: repo,
      now,
      batchSize: 2,
      maxBatches: 3,
    })).resolves.toMatchObject({
      batches: 3,
      truncated: true,
    });
    expect(repo.redactRunsBatch).toHaveBeenCalledTimes(3);
    expect(repo.deleteMessagesBatch).not.toHaveBeenCalled();
  });
});

describe("retention schema contract", () => {
  it("marks Concierge conversations explicitly and retains unlinked aggregate runs", () => {
    const schema = readFileSync("lib/db/schema-core.ts", "utf8");
    const migration = readFileSync(
      "drizzle/0011_m4a_chat_retention.sql",
      "utf8",
    );

    expect(schema).toMatch(/agentKind:.*agent_kind/s);
    expect(schema).toMatch(/agent_kind.*concierge/s);
    expect(schema).toMatch(
      /conversationId: uuid\("conversation_id"\)[\s\S]*references\(\(\) => conversations\.id, \{onDelete: "set null"\}\)/,
    );
    expect(schema).not.toMatch(
      /conversationId: uuid\("conversation_id"\)\s*\.notNull\(\)[\s\S]{0,120}agentRuns/,
    );
    expect(migration).toMatch(/ADD COLUMN "agent_kind".*'concierge'/is);
    expect(migration).toMatch(/CHECK.*agent_kind.*concierge/is);
    expect(migration).toMatch(/ON DELETE SET NULL/is);
  });
});


describe("production retention SQL boundary", () => {
  const dialect = new PgDialect();
  function database(results: Record<string, unknown>[][]) {
    const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      queries.push(dialect.sqlToQuery(query));
      return {rows: results.shift() ?? []};
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work(database),
    };
    return {database, queries};
  }
  it("counts the exact boundary with Concierge-only predicates and no content reads", async () => {
    const fixture = database([[
      {
        messages: 2,
        runs_to_redact: 1,
        runs_to_unlink: 1,
        empty_conversations: 1,
      },
    ]]);
    const repo = createChatRetentionRepository(async () => fixture.database);
    await expect(repo.inspect(
      new Date("2025-07-28T03:00:00.000Z"),
      now,
    )).resolves.toEqual({
      messages: 2,
      runsToRedact: 1,
      runsToUnlink: 1,
      emptyConversations: 1,
    });
    const query = fixture.queries[0];
    expect(query?.sql.match(/agent_kind = /g)).toHaveLength(4);
    expect(query?.sql.match(/agent_kind = 'concierge'/g)).toHaveLength(4);
    expect(query?.sql).toMatch(/transcript\.created_at < /);
    expect(query?.sql).not.toMatch(/transcript\.created_at <= /);
    expect(query?.sql).not.toMatch(/transcript\.content|run\.summary\s+AS/i);
  });
  it("bounds mutations, redacts only summaries, unlinks runs, and never targets non-Concierge rows", async () => {
    const conversationId = "11111111-1111-4111-8111-111111111111";
    const fixture = database([
      [{id: "run-redacted"}],
      [{id: "message-deleted"}],
      [{id: conversationId}],
      [{id: "run-redacted-at-delete"}],
      [{id: "run-unlinked"}],
      [{id: conversationId}],
    ]);
    const repo = createChatRetentionRepository(async () => fixture.database);
    await expect(repo.redactRunsBatch(
      new Date("2025-07-28T03:00:00.000Z"),
      25,
    )).resolves.toBe(1);
    await expect(repo.deleteMessagesBatch(
      new Date("2025-07-28T03:00:00.000Z"),
      25,
    )).resolves.toBe(1);
    await expect(repo.removeEmptyConversationsBatch(now, 25)).resolves.toEqual({
      conversationsDeleted: 1,
      runsUnlinked: 1,
      runsRedacted: 1,
    });
    const sqlText = fixture.queries.map((query) => query.sql);
    expect(sqlText[0]).toMatch(/"?conversation"?\."?agent_kind"? = /);
    expect(sqlText[0]).toMatch(/SET "?summary"? = /);
    expect(sqlText[0]).not.toMatch(/provider|model|input_tokens|output_tokens|cost_usd/);
    expect(sqlText[1]).toMatch(/"?conversation"?\."?agent_kind"? = /);
    expect(sqlText[1]).toMatch(/LIMIT /);
    expect(sqlText[2]).toMatch(/"?conversation"?\."?agent_kind"? = /);
    expect(sqlText[3]).toMatch(/SET "?summary"? = /);
    expect(sqlText[4]).toMatch(/SET "?conversation_id"? = /);
    expect(sqlText[5]).toMatch(/"?conversation"?\."?agent_kind"? = /);
    expect(JSON.stringify(fixture.queries)).not.toMatch(
      /retention-analyst|board-reporter|\.content/i,
    );
  });
});
