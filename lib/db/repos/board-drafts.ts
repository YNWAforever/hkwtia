import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb, type Database} from "@/lib/db/repos/common";
import {agentRuns, posts} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

const agentRunStatusSchema = z.enum([
  "running",
  "disabled",
  "completed",
  "failed",
  "escalated",
]);
const reportMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const sourceKeySchema = z.string().regex(
  /^board-report:\d{4}-(0[1-9]|1[0-2]):[A-Za-z0-9._-]+$/,
);
const boardDraftRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  titleEn: z.string(),
  titleZh: z.string(),
  sourceKey: sourceKeySchema,
  agentRunId: z.string().uuid(),
  agentRunStatus: agentRunStatusSchema,
  createdAt: z.coerce.date(),
});
const boardDraftPreviewRowSchema = boardDraftRowSchema.extend({
  bodyMdx: z.string(),
});
const boardDraftSchema = boardDraftRowSchema.omit({sourceKey: true}).extend({
  reportMonth: reportMonthSchema,
});
const boardDraftPreviewSchema = boardDraftSchema.extend({
  bodyMdx: z.string(),
});

export type BoardDraft = z.infer<typeof boardDraftSchema>;
export type BoardDraftPreview = z.infer<typeof boardDraftPreviewSchema>;
export type BoardDraftRepository = Readonly<{
  listUnpublished: (actor: Actor) => Promise<readonly BoardDraft[]>;
  getUnpublished: (
    actor: Actor,
    id: string,
  ) => Promise<BoardDraftPreview | null>;
}>;
type DatabaseLoader = () => Promise<Database>;

const BOARD_REPORT_SOURCE_KEY_PATTERN =
  "^board-report:[0-9]{4}-(0[1-9]|1[0-2]):[A-Za-z0-9._-]+$";

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  return [];
}

function reportMonth(sourceKey: string): string {
  return reportMonthSchema.parse(sourceKey.split(":")[1]);
}

function toBoardDraft(row: unknown): BoardDraft {
  const parsed = boardDraftRowSchema.parse(row);
  const {sourceKey, ...draft} = parsed;
  return boardDraftSchema.parse({
    ...draft,
    reportMonth: reportMonth(sourceKey),
  });
}

function toBoardDraftPreview(row: unknown): BoardDraftPreview {
  const parsed = boardDraftPreviewRowSchema.parse(row);
  const {sourceKey, ...draft} = parsed;
  return boardDraftPreviewSchema.parse({
    ...draft,
    reportMonth: reportMonth(sourceKey),
  });
}

export function createBoardDraftRepository(
  loadDatabase: DatabaseLoader = getDb,
): BoardDraftRepository {
  return {
    async listUnpublished(actor) {
      requireAdmin(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          ${posts.id} AS id,
          ${posts.slug} AS slug,
          ${posts.titleEn} AS "titleEn",
          ${posts.titleZh} AS "titleZh",
          ${posts.sourceKey} AS "sourceKey",
          ${posts.agentRunId} AS "agentRunId",
          ${agentRuns.status} AS "agentRunStatus",
          ${posts.createdAt} AS "createdAt"
        FROM ${posts}
        INNER JOIN ${agentRuns}
          ON ${posts.agentRunId} = ${agentRuns.id}
          AND ${agentRuns.agent} = ${"board_reporter"}
        WHERE ${posts.kind} = ${"page"}
          AND ${posts.publishedAt} IS NULL
          AND ${posts.author} = ${"Board Reporter"}
          AND ${posts.sourceKey} ~ ${BOARD_REPORT_SOURCE_KEY_PATTERN}
        ORDER BY ${posts.createdAt} DESC, ${posts.id} DESC
      `);
      return resultRows(result).map(toBoardDraft);
    },

    async getUnpublished(actor, id) {
      requireAdmin(actor);
      const parsedId = z.string().uuid().parse(id);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          ${posts.id} AS id,
          ${posts.slug} AS slug,
          ${posts.titleEn} AS "titleEn",
          ${posts.titleZh} AS "titleZh",
          ${posts.bodyMdx} AS "bodyMdx",
          ${posts.sourceKey} AS "sourceKey",
          ${posts.agentRunId} AS "agentRunId",
          ${agentRuns.status} AS "agentRunStatus",
          ${posts.createdAt} AS "createdAt"
        FROM ${posts}
        INNER JOIN ${agentRuns}
          ON ${posts.agentRunId} = ${agentRuns.id}
          AND ${agentRuns.agent} = ${"board_reporter"}
        WHERE ${posts.id} = ${parsedId}
          AND ${posts.kind} = ${"page"}
          AND ${posts.publishedAt} IS NULL
          AND ${posts.author} = ${"Board Reporter"}
          AND ${posts.sourceKey} ~ ${BOARD_REPORT_SOURCE_KEY_PATTERN}
        LIMIT 1
      `);
      const row = resultRows(result)[0];
      return row ? toBoardDraftPreview(row) : null;
    },
  };
}

export const boardDraftRepository = createBoardDraftRepository();
