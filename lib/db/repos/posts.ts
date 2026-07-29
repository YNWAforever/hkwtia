import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireScheduledAgent,
  type ScheduledAgentActor,
} from "@/lib/auth/agent-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {posts} from "@/lib/db/server-schema";

const boardDraftInputSchema = z.object({
  sourceKey: z.string().min(1).max(500),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),
  titleEn: z.string().min(1).max(500),
  titleZh: z.string().min(1).max(500),
  bodyMdx: z.string().min(1).max(500_000),
}).strict();

const boardDraftResultSchema = z.object({
  post_id: z.string().uuid(),
  created: z.boolean(),
});

export type BoardDraftInput = z.infer<typeof boardDraftInputSchema>;
export type PostsRepository = Readonly<{
  createBoardDraftOnce: (
    actor: ScheduledAgentActor,
    input: BoardDraftInput,
  ) => Promise<{postId: string; created: boolean}>;
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

export function createPostsRepository(
  loadDatabase: DatabaseLoader = getDb,
): PostsRepository {
  return {
    async createBoardDraftOnce(actor, input) {
      requireScheduledAgent(actor, "board_reporter");
      const parsed = boardDraftInputSchema.parse(input);
      const database = await loadDatabase();
      const rows = resultRows(await database.execute(sql`
        INSERT INTO ${posts}
          (
            slug,
            kind,
            title_en,
            title_zh,
            body_mdx,
            published_at,
            author,
            source_key,
            agent_run_id
          )
        VALUES (
          ${parsed.slug},
          ${"page"},
          ${parsed.titleEn},
          ${parsed.titleZh},
          ${parsed.bodyMdx},
          NULL,
          ${"Board Reporter"},
          ${parsed.sourceKey},
          ${actor.runId}
        )
        ON CONFLICT (source_key)
          WHERE source_key IS NOT NULL
        DO UPDATE SET source_key = EXCLUDED.source_key
        RETURNING
          id AS post_id,
          (xmax = 0) AS created
      `));
      const result = boardDraftResultSchema.parse(rows[0]);
      return {
        postId: result.post_id,
        created: result.created,
      };
    },
  };
}

export const postsRepository = createPostsRepository();
