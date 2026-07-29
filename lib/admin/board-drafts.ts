import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {posts} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

const boardDraftSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  titleEn: z.string(),
  titleZh: z.string(),
  bodyMdx: z.string(),
  sourceKey: z.string().nullable(),
  agentRunId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});

export type BoardDraft = z.infer<typeof boardDraftSchema>;
export type BoardDraftRepository = Readonly<{
  listUnpublished: (actor: Actor) => Promise<readonly BoardDraft[]>;
}>;
type DatabaseLoader = () => Promise<Database>;

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
          ${posts.bodyMdx} AS "bodyMdx",
          ${posts.sourceKey} AS "sourceKey",
          ${posts.agentRunId} AS "agentRunId",
          ${posts.createdAt} AS "createdAt"
        FROM ${posts}
        WHERE ${posts.kind} = ${"page"}
          AND ${posts.publishedAt} IS NULL
          AND ${posts.author} = ${"Board Reporter"}
        ORDER BY ${posts.createdAt} DESC, ${posts.id} DESC
      `);
      return z.array(boardDraftSchema).parse(resultRows(result));
    },
  };
}

export const boardDraftRepository = createBoardDraftRepository();

export async function listBoardDrafts(
  actor: Actor,
  repository: BoardDraftRepository = boardDraftRepository,
): Promise<readonly BoardDraft[]> {
  requireAdmin(actor);
  return repository.listUnpublished(actor);
}
