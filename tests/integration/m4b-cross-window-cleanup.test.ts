import {Pool} from "pg";
import {describe, expect, it} from "vitest";

import {
  buildM4BAcceptanceFixture,
  M4B_ACCEPTANCE_FIXTURE,
  seedM4B,
} from "@/scripts/seed-m4b";

const databaseAcceptanceEnabled =
  process.env.RUN_DATABASE_TESTS === "true"
  && process.env.RUN_M4B_ACCEPTANCE_TESTS === "true";

describe.skipIf(!databaseAcceptanceEnabled)(
  "M4B cross-window cleanup isolation",
  () => {
    it("removes all marked prior-window effects and runs but preserves unrelated rows", async () => {
      const databaseUrl = process.env.DATABASE_URL_TEST?.trim();
      if (!databaseUrl || process.env.DATABASE_URL?.trim() !== databaseUrl) {
        throw new Error(
          "M4B cleanup acceptance requires matching isolated DB URLs.",
        );
      }
      const fixture = buildM4BAcceptanceFixture(
        M4B_ACCEPTANCE_FIXTURE.asOf,
      );
      const ids = {
        markedRetention: "45000001-0000-4000-8000-000000000001",
        markedBoard: "45000001-0000-4000-8000-000000000002",
        markedOrphan: "45000001-0000-4000-8000-000000000003",
        unrelatedRetention: "45000001-0000-4000-8000-000000000004",
        unrelatedBoard: "45000001-0000-4000-8000-000000000005",
        markedApproval: "45000002-0000-4000-8000-000000000001",
        unrelatedApproval: "45000002-0000-4000-8000-000000000002",
        markedPost: "45000003-0000-4000-8000-000000000001",
        unrelatedPost: "45000003-0000-4000-8000-000000000002",
      } as const;
      const pool = new Pool({connectionString: databaseUrl});

      try {
        await pool.query(
          `INSERT INTO agent_runs
             (id, agent, conversation_id, profile_id, trigger, status,
              summary, started_at, created_at, updated_at)
           VALUES
             ($1, 'retention_analyst', NULL, NULL, 'scheduled', 'completed',
              $6, $8, $8, $8),
             ($2, 'board_reporter', NULL, NULL, 'scheduled', 'completed',
              $6, $8, $8, $8),
             ($3, 'board_reporter', NULL, NULL, 'scheduled', 'completed',
              $7, $8, $8, $8),
             ($4, 'retention_analyst', NULL, NULL, 'scheduled', 'completed',
              'unrelated-retention-run', $8, $8, $8),
             ($5, 'board_reporter', NULL, NULL, 'scheduled', 'completed',
              'unrelated-board-run', $8, $8, $8)`,
          [
            ids.markedRetention,
            ids.markedBoard,
            ids.markedOrphan,
            ids.unrelatedRetention,
            ids.unrelatedBoard,
            fixture.agentRunOwnershipMarker,
            `${fixture.agentRunOwnershipMarker}:answered`,
            fixture.asOf,
          ],
        );
        await pool.query(
          `INSERT INTO approvals
             (id, action_type, payload, request_key, status, requested_at)
           VALUES
             ($1, 'agent.retention_outreach',
              jsonb_build_object('agentRunId', $3::text),
              'retention:2029-12-31:marked:retention-analyst-v1',
              'pending', $5),
             ($2, 'agent.retention_outreach',
              jsonb_build_object('agentRunId', $4::text),
              'retention:2029-12-31:unrelated:retention-analyst-v1',
              'pending', $5)`,
          [
            ids.markedApproval,
            ids.unrelatedApproval,
            ids.markedRetention,
            ids.unrelatedRetention,
            fixture.asOf,
          ],
        );
        await pool.query(
          `INSERT INTO posts
             (id, slug, kind, title_en, title_zh, body_mdx, author,
              source_key, agent_run_id, created_at, updated_at)
           VALUES
             ($1, 'm4b-marked-prior-report', 'page', 'Marked', 'Marked',
              'Marked', 'board_reporter',
              'board-report:2029-12:board-reporter-v1', $3, $5, $5),
             ($2, 'm4b-unrelated-prior-report', 'page', 'Unrelated',
              'Unrelated', 'Unrelated', 'board_reporter',
              'board-report:2029-11:unrelated', $4, $5, $5)`,
          [
            ids.markedPost,
            ids.unrelatedPost,
            ids.markedBoard,
            ids.unrelatedBoard,
            fixture.asOf,
          ],
        );

        await seedM4B(pool, {asOf: fixture.asOf});

        const runs = await pool.query<{id: string}>(
          "SELECT id::text FROM agent_runs WHERE id = ANY($1::uuid[]) ORDER BY id",
          [[
            ids.markedRetention,
            ids.markedBoard,
            ids.markedOrphan,
            ids.unrelatedRetention,
            ids.unrelatedBoard,
          ]],
        );
        const approvals = await pool.query<{id: string}>(
          "SELECT id::text FROM approvals WHERE id = ANY($1::uuid[]) ORDER BY id",
          [[ids.markedApproval, ids.unrelatedApproval]],
        );
        const posts = await pool.query<{id: string}>(
          "SELECT id::text FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id",
          [[ids.markedPost, ids.unrelatedPost]],
        );
        expect(runs.rows).toEqual([
          {id: ids.unrelatedRetention},
          {id: ids.unrelatedBoard},
        ]);
        expect(approvals.rows).toEqual([{id: ids.unrelatedApproval}]);
        expect(posts.rows).toEqual([{id: ids.unrelatedPost}]);
      } finally {
        await pool.query(
          "DELETE FROM approvals WHERE id = $1",
          [ids.unrelatedApproval],
        );
        await pool.query(
          "DELETE FROM posts WHERE id = $1",
          [ids.unrelatedPost],
        );
        await pool.query(
          "DELETE FROM agent_runs WHERE id = ANY($1::uuid[])",
          [[ids.unrelatedRetention, ids.unrelatedBoard]],
        );
        await pool.end();
      }
    });
  },
);
