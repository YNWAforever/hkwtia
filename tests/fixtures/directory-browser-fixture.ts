import {Pool} from "pg";
import {M2_UUIDS} from "@/scripts/seed-m2";
import {assertIsolatedSeedEnvironment} from "@/scripts/lib/acceptance-guard";

/** Prepare only the synthetic owner's public fields; preserve membership and all audit history. */
export async function withSyntheticCompanyProfile(authUserId: string, slug: string, exercise: () => Promise<void>): Promise<void> {
  if (process.env.AUDIT_BATCH_WORKER_PAUSED !== "true") throw new Error("DIRECTORY_BROWSER_WORKER_MUST_BE_PAUSED");
  const databaseUrl = assertIsolatedSeedEnvironment(process.env, {prefix: "DIRECTORY_BROWSER", flag: "AUDIT_ISOLATED_ACCEPTANCE", hostAllowlistVar: "M2_TEST_NEON_HOST"});
  if (!authUserId) throw new Error("DIRECTORY_BROWSER_AUTH_IDENTITY_REQUIRED");
  const pool = new Pool({connectionString: databaseUrl});
  const columns = ["slug", "tags", "tagline_en", "tagline_zh_hk", "description_zh_hk", "logo_media_id", "public_profile_status", "public_profile_published_at", "profile_reviewed_at", "profile_reviewed_by_profile_id", "profile_rejection_reason"] as const;
  try {
    const result = await pool.query<Record<string, unknown>>(`SELECT c.id, ${columns.map(c => "c." + c).join(", ")} FROM companies c JOIN company_members cm ON cm.company_id=c.id JOIN profiles p ON p.id=cm.user_id WHERE p.auth_user_id=$1 AND p.id LIKE 'm2-%' AND cm.revoked_at IS NULL AND cm.role IN ('owner','admin')`, [authUserId]);
    if (result.rows.length !== 1 || !M2_UUIDS.companies.includes(String(result.rows[0]?.id))) throw new Error("DIRECTORY_BROWSER_OWNER_SCOPE_AMBIGUOUS");
    const original = result.rows[0]!;
    await pool.query("UPDATE companies SET public_profile_status='hidden' WHERE id=$1 AND public_profile_status=$2", [original.id, original.public_profile_status]);
    try {await exercise();} finally {
      // Refuse to overwrite a concurrent edit to a different slug.
      const restored = await pool.query(`UPDATE companies SET ${columns.map((c, i) => `${c}=$${i + 2}`).join(", ")}, updated_at=now() WHERE id=$1 AND (slug=$${columns.length + 2} OR slug IS NOT DISTINCT FROM $2) RETURNING id`, [original.id, ...columns.map(c => original[c]), slug]);
      if (restored.rowCount !== 1) throw new Error("DIRECTORY_BROWSER_RESTORE_CONFLICT");
    }
  } finally {await pool.end();}
}
