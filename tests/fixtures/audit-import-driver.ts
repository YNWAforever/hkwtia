import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {z} from "zod";
import {createAdminBatchWorkerRepository, type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {importCommitBatchHandler} from "@/lib/db/repos/batch-handlers/import-commit";
import {batchRequestSchema} from "@/lib/admin/batches/types";

async function main() {
  if (process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true" || process.env.AUDIT_BATCH_WORKER_PAUSED !== "true") throw new Error("ISOLATED_PAUSED_WORKER_REQUIRED");
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString || new URL(connectionString).hostname !== process.env.M2_TEST_NEON_HOST) throw new Error("EXACT_TEST_HOST_REQUIRED");
  const [rawMode, rawRun, rawBatchId] = process.argv.slice(2);
  const mode = z.enum(["seed", "prepare", "execute", "facts"]).parse(rawMode);
  const run = z.string().uuid().parse(rawRun);
  const profileId = `audit-import-${run}`, email = `${profileId}@example.test`, newEmail = `audit-import-new-${run}@example.test`;
  const pool = new Pool({connectionString});
  try {
    if (mode === "seed") {
      await pool.query("INSERT INTO profiles (id,auth_user_id,display_name,email,locale) VALUES ($1,$1,'Synthetic import member',$2,'en')", [profileId, email]);
      console.log(JSON.stringify({csv: `Member ID,Email,Locale,Name,Plan\n${profileId},${email},zh-HK,,corporate\n,${newEmail},en,Synthetic new contact,patron\n,${newEmail},en,Duplicate,\n,not-an-email,en,Invalid,\n`}));
      return;
    }
    const batchId = z.string().uuid().parse(rawBatchId);
    const batch = (await pool.query("SELECT operation,selection_snapshot FROM admin_batches WHERE id=$1", [batchId])).rows[0];
    const request = batchRequestSchema.parse(batch?.selection_snapshot);
    if (batch?.operation !== "import_commit" || request.operation !== "import_commit") throw new Error("IMPORT_BATCH_REQUIRED");
    const runId = request.payload.importRunId;
    const selected = (await pool.query("SELECT row_number,match_target_id,validated_payload FROM member_import_rows WHERE run_id=$1 AND confirmed ORDER BY row_number", [runId])).rows;
    if (selected.length !== 2 || selected[0].row_number !== 2 || selected[0].match_target_id !== profileId || selected[0].validated_payload.email !== email || selected[1].row_number !== 3 || selected[1].match_target_id !== null || selected[1].validated_payload.email !== newEmail) throw new Error("EXACT_SYNTHETIC_SCOPE_REQUIRED");
    if (mode === "facts") {
      const contact = (await pool.query("SELECT source,profile_id FROM contacts WHERE email=$1", [newEmail])).rows;
      const profile = (await pool.query("SELECT locale FROM profiles WHERE id=$1", [profileId])).rows[0];
      const memberships = (await pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id=$1", [profileId])).rows[0].n;
      const audits = (await pool.query("SELECT (metadata->>'rowNumber')::int AS row_number,count(*)::int AS n FROM audit_events WHERE action='member.import.row.committed' AND metadata->>'runId'=$1 GROUP BY metadata->>'rowNumber' ORDER BY row_number", [runId])).rows;
      console.log(JSON.stringify({contact,profile,memberships,audits})); return;
    }
    if ((await pool.query("SELECT count(*)::int AS n FROM admin_batches WHERE state IN ('preparing','queued','running') AND id<>$1", [batchId])).rows[0].n !== 0) throw new Error("OTHER_ACTIVE_BATCHES");
    const worker = createAdminBatchWorkerRepository(async () => drizzle(pool) as unknown as BatchDatabase), now = new Date();
    if (mode === "prepare") {console.log(JSON.stringify({prepared: await worker.prepareNext({import_commit: importCommitBatchHandler}, now)})); return;}
    const claims = await worker.claimItems(`audit-import-${randomUUID()}`, now, 2);
    if (claims.length !== 2 || claims.some(claim => claim.batchId !== batchId)) throw new Error("UNEXPECTED_CLAIMS");
    for (const claim of claims) await worker.executeClaim(claim, importCommitBatchHandler, now);
    console.log(JSON.stringify({claimed: claims.length}));
  } finally {await pool.end();}
}
main().catch(() => {console.error("AUDIT_IMPORT_FIXTURE_FAILED: check isolated host, paused worker, exact synthetic scope and migration ledger"); process.exitCode = 1;});
