import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {createPostsRepository} from "@/lib/db/repos/posts";

const actor: ScheduledAgentActor = {
  kind: "agent",
  agent: "board_reporter",
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};

const input = {
  sourceKey: "board-report:2027-03:board-reporter-v1",
  slug: "board-report-2027-03",
  titleEn: "Board report: 2027-03",
  titleZh: "Board report: 2027-03",
  bodyMdx: "# Board report: 2027-03\n",
};

const normalizedSql = (statement: string): string =>
  statement.replace(/\s+/g, " ").trim().toLowerCase();

describe("posts repository", () => {
  it("creates one unpublished board draft and recovers the first concurrent winner", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    let call = 0;
    const database = drizzle(async (query, params) => {
      statements.push({sql: normalizedSql(query), params});
      call += 1;
      const currentCall = call;
      await Promise.resolve();
      return {
        rows: [{
          post_id: "22222222-2222-4222-8222-222222222222",
          created: currentCall === 1,
        }],
      };
    });
    const repository = createPostsRepository(async () => database as never);

    await expect(Promise.all([
      repository.createBoardDraftOnce(actor, input),
      repository.createBoardDraftOnce(actor, input),
    ])).resolves.toEqual([
      {postId: "22222222-2222-4222-8222-222222222222", created: true},
      {postId: "22222222-2222-4222-8222-222222222222", created: false},
    ]);

    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.sql).toMatch(/insert into "posts"/);
      expect(statement.sql).toMatch(
        /on conflict.*source_key.*do update set source_key = excluded\.source_key/,
      );
      expect(statement.sql).toMatch(/published_at.*values.*null/);
      expect(statement.sql).not.toMatch(/body_mdx\s*=|agent_run_id\s*=/);
      expect(statement.params).toEqual(expect.arrayContaining([
        "page",
        "Board Reporter",
        input.sourceKey,
        input.slug,
        input.titleEn,
        input.titleZh,
        input.bodyMdx,
        actor.runId,
      ]));
    }
  });

  it("rejects every identity except board_reporter before database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createPostsRepository(loadDatabase);

    await expect(repository.createBoardDraftOnce(
      {...actor, agent: "retention_analyst"},
      input,
    )).rejects.toThrow("FORBIDDEN");
    await expect(repository.createBoardDraftOnce(
      {kind: "staff"} as never,
      input,
    )).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
