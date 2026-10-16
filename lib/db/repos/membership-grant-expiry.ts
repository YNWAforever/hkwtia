import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, memberships} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {GrantDatabase} from "@/lib/db/repos/membership-grants";

function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const idRows = z.array(z.object({id: z.string().uuid()}));

/** A bounded cleanup of granted membership state. Access checks already deny on the timestamp if this job is late. */
export async function expireFiniteGrants(now: Date, options: {loadDatabase?: () => Promise<GrantDatabase>} = {}): Promise<number> {
  const db = await (options.loadDatabase ?? (async () => await getDb() as unknown as GrantDatabase))();
  return db.transaction(async (tx) => {
    const due = idRows.parse(rows(await tx.execute(sql`
      WITH due AS (
        SELECT ${memberships.id} FROM ${memberships}
        WHERE ${memberships.grantExpiresAt} <= ${now}
          AND ${memberships.grantEffectiveAt} IS NOT NULL
          AND ${memberships.grantReason} IS NOT NULL
          AND ${memberships.stripeCustomerId} IS NULL
          AND ${memberships.stripeSubscriptionId} IS NULL
          AND ${memberships.status} = 'active'
        ORDER BY ${memberships.grantExpiresAt}, ${memberships.id}
        LIMIT 50 FOR UPDATE SKIP LOCKED
      )
      UPDATE ${memberships} SET status = 'expired', updated_at = ${now}
      FROM due WHERE ${memberships.id} = due.id
      RETURNING ${memberships.id} AS id
    `)));
    for (const row of due) await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (NULL, 'system', 'membership.grant.expired', 'membership', ${row.id}, jsonb_build_object('expiredAt', ${now.toISOString()}::text))`);
    return due.length;
  });
}
