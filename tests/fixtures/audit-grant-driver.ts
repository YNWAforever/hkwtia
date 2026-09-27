import {Pool} from "pg";
import {z} from "zod";
async function main() {
  if (process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true") throw new Error("ISOLATION_REQUIRED");
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString || new URL(connectionString).hostname !== process.env.M2_TEST_NEON_HOST) throw new Error("EXACT_TEST_HOST_REQUIRED");
  const [rawMode, rawRun] = process.argv.slice(2), mode = z.enum(["seed", "facts"]).parse(rawMode), run = z.string().uuid().parse(rawRun);
  const profileId = `audit-grant-${run}`, pool = new Pool({connectionString});
  try {
    if (mode === "seed") await pool.query("INSERT INTO profiles(id,auth_user_id,display_name,email,locale) VALUES($1,$1,'Synthetic grant member',$2,'en')", [profileId, `${profileId}@example.test`]);
    const grants = (await pool.query("SELECT id,plan_code,status,grant_effective_at,grant_expires_at,grant_reason,grant_actor_profile_id,billing_period_end FROM memberships WHERE owner_user_id=$1", [profileId])).rows;
    const audits = (await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.created' AND metadata->>'targetId'=$1", [profileId])).rows[0].n;
    console.log(JSON.stringify({profileId,grants,audits}));
  } finally {await pool.end();}
}
main().catch(() => {console.error("AUDIT_GRANT_FIXTURE_FAILED: check isolated host, exact synthetic scope and migrations"); process.exitCode = 1;});
