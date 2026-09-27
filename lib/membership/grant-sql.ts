import {sql, type SQL} from "drizzle-orm";
import {memberships} from "@/lib/db/server-schema";

/** Existing paid and historic comp rows are null/null; a partial or timed grant fails closed. */
export function membershipGrantValiditySql(now: Date | SQL = sql`now()`): SQL {
  return sql`((${memberships.grantEffectiveAt} IS NULL AND ${memberships.grantExpiresAt} IS NULL) OR (${memberships.grantEffectiveAt} <= ${now} AND ${memberships.grantExpiresAt} > ${now}))`;
}
