import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {
  createBoardDraftRepository,
  listBoardDrafts,
  type BoardDraftRepository,
  getBoardDraft,
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
  reportMonth: "2026-06",
  agentRunId: "22222222-2222-4222-8222-222222222222",
  agentRunStatus: "completed" as const,
  createdAt: new Date("2026-07-20T01:00:00.000Z"),
};
const preview = {
  ...draft,
  bodyMdx: "# Board report: 2026-06",
};

function fakeRepository(): BoardDraftRepository {
  return {
    listUnpublished: vi.fn().mockResolvedValue([draft]),
    getUnpublished: vi.fn().mockResolvedValue(preview),
  };
}

const normalizedSql = (statement: string): string =>
  statement.replace(/\s+/g, " ").trim().toLowerCase();

describe("board draft admin reader", () => {
  it("requires an admin actor before repository access", async () => {
    const repository = fakeRepository();

    await expect(listBoardDrafts(member, repository)).rejects.toThrow("FORBIDDEN");
    expect(repository.listUnpublished).not.toHaveBeenCalled();
    await expect(listBoardDrafts(staff, repository)).resolves.toEqual([draft]);
    expect(repository.listUnpublished).toHaveBeenCalledTimes(1);

    await expect(getBoardDraft(member, draft.id, repository)).rejects.toThrow("FORBIDDEN");
    expect(repository.getUnpublished).not.toHaveBeenCalled();
    await expect(getBoardDraft(staff, draft.id, repository)).resolves.toEqual(preview);
    expect(repository.getUnpublished).toHaveBeenCalledWith(staff, draft.id);
  });

  it("queries only unpublished Board Reporter page drafts joined to the exact board_reporter run", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (query, params) => {
      statements.push({sql: normalizedSql(query), params});
      return {rows: [{
        id: draft.id,
        slug: draft.slug,
        titleEn: draft.titleEn,
        titleZh: draft.titleZh,
        bodyMdx: preview.bodyMdx,
        sourceKey: "board-report:2026-06:board-reporter-v1",
        agentRunId: draft.agentRunId,
        agentRunStatus: draft.agentRunStatus,
        createdAt: draft.createdAt,
      }]};
    });
    const loadDatabase = vi.fn(async () => database as never);
    const repository = createBoardDraftRepository(loadDatabase);

    await expect(repository.listUnpublished(member)).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);

    await expect(repository.listUnpublished(staff)).resolves.toEqual([draft]);
    await expect(repository.getUnpublished(staff, draft.id)).resolves.toEqual(preview);

    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain('from "posts"');
    expect(statements[0].sql).toMatch(/inner join "agent_runs"/);
    expect(statements[0].sql).toMatch(/"agent_run_id" = .*"agent_runs"\."id"/);
    expect(statements[0].params).toContain("board_reporter");
    expect(statements[0].sql).toMatch(/"kind" = \$\d+/);
    expect(statements[0].sql).toMatch(/"published_at" is null/);
    expect(statements[0].params).toEqual(expect.arrayContaining(["page", "Board Reporter"]));
    expect(statements[1].sql).toMatch(/"posts"\."id" =/);
    expect(statements[1].params).toContain(draft.id);
  });

  it("exposes structured report month and exact agent-run status without serializing the body in the list", async () => {
    const repository = fakeRepository();

    const rows = await listBoardDrafts(staff, repository);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "board-report-2026-06",
      reportMonth: "2026-06",
      agentRunId: "22222222-2222-4222-8222-222222222222",
      agentRunStatus: "completed",
    });
    expect(rows[0]).not.toHaveProperty("bodyMdx");
  });

  it("adds an admin-guarded preview page with no send or publish action", () => {
    const routePath = resolve(
      process.cwd(),
      "app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx",
    );
    expect(existsSync(routePath)).toBe(true);
    if (!existsSync(routePath)) return;

    const source = readFileSync(routePath, "utf8");
    expect(source).toContain("requireAdminPageActor");
    expect(source).toContain("getBoardDraft");
    expect(source).toContain("SafeGeneratedContent");
    expect(source).toContain("notFound()");
    expect(source).not.toMatch(/publishAction|sendAction|<form|<button/);
  });
});
