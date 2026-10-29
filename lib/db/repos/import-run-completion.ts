import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {auditEvents, memberImportRows, memberImportRuns, profiles} from "@/lib/db/server-schema";

type Executor = Readonly<{execute: (query: SQL) => PromiseLike<unknown>}>;

export type CompletedImportBatch = Readonly<{id: string; actorProfileId: string; importRunId: string}>;

/**
 * The batch worker used to mark admin_batches completed and leave
 * member_import_runs in `confirmed`. There is no other completion path: a
 * script that calls the same worker hits this too. Failures stay confirmed so
 * a retry can still execute. A later successful completion of the same run
 * moves it once; the confirmed predicate makes a second pass a no-op.
 */
export async function markCompletedImportRuns(tx: Executor, batches: readonly CompletedImportBatch[]): Promise<void> {
  if (!batches.length) return;
  const payload = JSON.stringify(batches.map((batch) => ({batch_id: batch.id, actor_profile_id: batch.actorProfileId, run_id: batch.importRunId})));
  await tx.execute(sql`
    WITH candidates AS (
      SELECT DISTINCT ON (c.run_id) c.batch_id, c.actor_profile_id, c.run_id
      FROM jsonb_to_recordset(${payload}::jsonb) AS c(batch_id uuid, actor_profile_id text, run_id uuid)
      ORDER BY c.run_id, c.batch_id
    ),
    ready AS (
      SELECT c.batch_id, c.actor_profile_id, c.run_id
      FROM candidates c
      JOIN ${memberImportRuns} r ON r.id = c.run_id AND r.state = 'confirmed'
      WHERE NOT EXISTS (
        SELECT 1 FROM ${memberImportRows} row
        WHERE row.run_id = c.run_id AND row.confirmed = true AND row.validation_status IN ('create', 'update')
          AND NOT EXISTS (
            SELECT 1 FROM admin_batch_items i
            WHERE i.batch_id = c.batch_id AND i.target_type = 'import_row' AND i.target_id = row.id::text AND i.state IN ('succeeded', 'skipped')
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM admin_batches other
        WHERE other.id <> c.batch_id AND other.operation = 'import_commit'
          AND other.selection_snapshot->'payload'->>'importRunId' = c.run_id::text
          AND other.state IN ('preparing', 'queued', 'running')
      )
    ),
    updated AS (
      UPDATE ${memberImportRuns} r SET state = 'committed'
      FROM ready WHERE r.id = ready.run_id AND r.state = 'confirmed'
      RETURNING r.id, ready.batch_id, ready.actor_profile_id
    )
    INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
    SELECT u.actor_profile_id, coalesce(p.role, 'system'), 'member.import.committed', 'member_import_run', u.id::text, jsonb_build_object('batchId', u.batch_id::text)
    FROM updated u
    LEFT JOIN ${profiles} p ON p.id = u.actor_profile_id
  `);
}
