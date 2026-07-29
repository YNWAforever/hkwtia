import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {
  createBoardDraftRepository,
  listBoardDrafts,
  type BoardDraftRepository,
} from "@/lib/admin/board-drafts";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

const staff: AdminActor = {
  kind: "staff",
  userId: "auth-staff",
  profileId: "profile-staff",
};
const member: Actor = {
  kind: "member",
  userId: "auth-member",
  profileId: "profile-member",
};

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "board-report-2026-06",
  titleEn: "Board report: 2026-06",
  titleZh: "董事會報告：2026-06",
  bodyMdx: "# Board report: 2026-06",
  sourceKey: "board-report:2026-06:board-reporter-v1",
  agentRunId: "22222222-2222-4222-8222-222222222222",
  createdAt: new Date("2026-07-20T01:00:00.000Z"),
};

const normalizedSql = (statement: string): string =>
  statement.replace(/\s+/g, " ").trim().toLowerCase();

describe("board draft admin reader", () => {
  it("requires an admin actor before repository access", async () => {
    const repository: BoardDraftRepository = {
      listUnpublished: vi.fn().mockResolvedValue([draft]),
    };

    await expect(listBoardDrafts(member, repository)).rejects.toThrow("FORBIDDEN");
    expect(repository.listUnpublished).not.toHaveBeenCalled();
    await expect(listBoardDrafts(staff, repository)).resolves.toEqual([draft]);
    expect(repository.listUnpublished).toHaveBeenCalledTimes(1);
  });

  it("queries only unpublished Board Reporter page drafts with provenance", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (query, params) => {
      statements.push({sql: normalizedSql(query), params});
      return {rows: [{
        id: draft.id,
        slug: draft.slug,
        titleEn: draft.titleEn,
        titleZh: draft.titleZh,
        bodyMdx: draft.bodyMdx,
        sourceKey: draft.sourceKey,
        agentRunId: draft.agentRunId,
        createdAt: draft.createdAt,
      }]};
    });
    const loadDatabase = vi.fn(async () => database as never);
    const repository = createBoardDraftRepository(loadDatabase);

    await expect(repository.listUnpublished(member)).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);

    await expect(repository.listUnpublished(staff)).resolves.toEqual([draft]);

    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('from "posts"');
    expect(statements[0].sql).toMatch(/"kind" = .*\$1/);
    expect(statements[0].sql).toMatch(/"published_at" is null/);
    expect(statements[0].sql).toMatch(/"author" = .*\$2/);
    expect(statements[0].params).toEqual(["page", "Board Reporter"]);
  });

  it("does not expose published, non-page, or non-reporter rows through the repository filter", async () => {
    const repository: BoardDraftRepository = {
      listUnpublished: vi.fn().mockResolvedValue([draft]),
    };

    const rows = await listBoardDrafts(staff, repository);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "board-report-2026-06",
      sourceKey: "board-report:2026-06:board-reporter-v1",
      agentRunId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
