import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, membershipPlans, memberships, profiles} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {grantInputSchema, type MembershipGrantInput} from "@/lib/membership/grants";
import {forbidden, type Actor} from "@/lib/membership/lifecycle";

export type GrantExecutor = Readonly<{execute: (query: SQL) => PromiseLike<unknown>}>;
export type GrantDatabase = Readonly<{transaction: <T>(work: (tx: GrantExecutor) => Promise<T>) => Promise<T>}>;
export type GrantOptions = Readonly<{enabled?: boolean; loadDatabase?: () => Promise<GrantDatabase>}>;
function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const idRow = z.object({id: z.string().uuid()});
const planRow = z.object({seatAllowance: z.coerce.number().int().nonnegative()});

/** Invoked within the caller's transaction, including the T13 batch item transaction. */
export async function insertFiniteProfileGrant(tx: GrantExecutor, actor: Actor, input: MembershipGrantInput): Promise<string> {
  if (actor.kind !== "superadmin") forbidden();
  if (input.target.kind !== "profile") throw new Error("GRANT_COMPANY_POLICY_UNAPPROVED");
  const profileId = input.target.profileId;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`finite-grant:${profileId}`}))`);
  const target = rows(await tx.execute(sql`SELECT ${profiles.id} AS id FROM ${profiles} WHERE ${profiles.id} = ${profileId} AND ${profiles.role} = 'member' LIMIT 1`));
  if (!target.length) throw new Error("GRANT_TARGET_NOT_MEMBER");
  const live = rows(await tx.execute(sql`SELECT ${memberships.id} AS id FROM ${memberships} WHERE ${memberships.ownerUserId} = ${profileId} AND ${memberships.status} NOT IN ('cancelled','expired') LIMIT 1 FOR UPDATE`));
  if (live.length) throw new Error("MEMBERSHIP_ALREADY_EXISTS");
  const plan = rows(await tx.execute(sql`SELECT ${membershipPlans.seatAllowance} AS "seatAllowance" FROM ${membershipPlans} WHERE ${membershipPlans.code} = ${input.planCode} LIMIT 1`));
  if (!plan.length) throw new Error("MEMBERSHIP_PLAN_NOT_FOUND");
  const seatLimit = planRow.parse(plan[0]).seatAllowance;
  const grant = idRow.parse(rows(await tx.execute(sql`INSERT INTO ${memberships} (owner_user_id, company_id, plan_code, status, seat_limit, grant_effective_at, grant_expires_at, grant_reason, grant_actor_profile_id) VALUES (${profileId}, NULL, ${input.planCode}, 'active', ${seatLimit}, ${new Date(input.effectiveAt)}, ${new Date(input.expiresAt)}, ${input.reason}, ${actor.profileId}) RETURNING ${memberships.id} AS id`))[0]);
  await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'membership.grant.created', 'membership', ${grant.id}, jsonb_build_object('targetKind','profile','targetId',${profileId}::text,'planCode',${input.planCode}::text,'effectiveAt',${input.effectiveAt}::text,'expiresAt',${input.expiresAt}::text))`);
  return grant.id;
}

export async function grantMembership(actor: Actor, input: unknown, options: GrantOptions = {}): Promise<string> {
  if (actor.kind !== "superadmin") forbidden();
  if (!(options.enabled ?? process.env.MEMBERSHIP_GRANTS_ENABLED === "true")) throw new Error("MEMBERSHIP_GRANTS_DISABLED");
  const parsed = grantInputSchema.parse(input);
  if (parsed.target.kind !== "profile") throw new Error("GRANT_COMPANY_POLICY_UNAPPROVED");
  const db = await (options.loadDatabase ?? (async () => await getDb() as unknown as GrantDatabase))();
  try {return await db.transaction((tx) => insertFiniteProfileGrant(tx, actor, parsed));}
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "memberships_owner_live_unique") throw new Error("MEMBERSHIP_ALREADY_EXISTS");
    throw error;
  }
}
