import type {Pool} from '@neondatabase/serverless';

export const ownedFixtureTime='2026-10-26T00:00:00.000123Z';
/** Shared T22-06 bulk shape; caller owns target verification and exact-ID cleanup. */
export async function insertOwnedApplications(pool: Pool, ownerId: string, ids: readonly string[]) {
  await pool.query(`INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,updated_at)
    SELECT id,$2,'community','draft',$3::timestamptz FROM unnest($1::uuid[]) id`,[ids,ownerId,ownedFixtureTime]);
  // Bulk fixtures need current owner cardinalities before measuring planner choices.
  await pool.query('ANALYZE membership_applications');
}
