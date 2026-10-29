import {Pool} from "@neondatabase/serverless";

import {applyMemberImportRollback, assertMemberImportRollbackAuthorized, inspectMemberImportRollback} from "@/scripts/lib/member-import-rollback";

/**
 * Roll back one committed member import. Dry-run unless
 * MEMBER_IMPORT_ROLLBACK_APPLY=true. Refuses production with the same
 * MEMBER_IMPORT_ENABLED / MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED split as
 * the importer. Does not send mail or call Stripe. Does not delete
 * membership_plans.
 *
 *   MEMBER_IMPORT_ENABLED=true MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED=true \
 *   MEMBER_IMPORT_ROLLBACK_RUN_ID=... MEMBER_IMPORT_ROLLBACK_BATCH_ID=... \
 *   npx tsx scripts/rollback-member-import.ts
 */
export async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const scope = assertMemberImportRollbackAuthorized(environment);
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("MEMBER_IMPORT_ROLLBACK_DATABASE_URL_REQUIRED");
  const pool = new Pool({connectionString: databaseUrl});
  const client = await pool.connect();
  try {
    if (!scope.apply) {
      const report = await inspectMemberImportRollback(client, scope);
      console.log(JSON.stringify({...report, apply: false}, null, 2));
      console.log("DRY_RUN");
      return;
    }
    const report = await applyMemberImportRollback(client, scope);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "MEMBER_IMPORT_ROLLBACK_FAILED";
    throw new Error(message.includes(databaseUrl) ? "MEMBER_IMPORT_ROLLBACK_FAILED" : message);
  } finally {
    client.release();
    await pool.end();
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("scripts/rollback-member-import.ts") || entry?.endsWith("scripts/rollback-member-import.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "MEMBER_IMPORT_ROLLBACK_FAILED");
    process.exitCode = 1;
  });
}
