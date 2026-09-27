import {sql, type SQL, type SQLWrapper} from "drizzle-orm";
import {memberships} from "@/lib/db/server-schema";

type GrantColumns = Readonly<{grantEffectiveAt: SQLWrapper; grantExpiresAt: SQLWrapper}>;

/** Existing paid and historic comp rows are null/null; a partial or timed grant fails closed.
 * Pass aliased columns when the membership table is aliased in the enclosing query.
 */
export function membershipGrantValiditySql(now: Date | SQL = sql`now()`, source: GrantColumns = memberships): SQL {
  return sql`((${source.grantEffectiveAt} IS NULL AND ${source.grantExpiresAt} IS NULL) OR (${source.grantEffectiveAt} <= ${now} AND ${source.grantExpiresAt} > ${now}))`;
}
