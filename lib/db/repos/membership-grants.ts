import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, companies, membershipPlans, memberships, profiles} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {grantInputSchema, type MembershipGrantInput} from "@/lib/membership/grants";
import {forbidden, type Actor} from "@/lib/membership/lifecycle";

export type GrantExecutor = Readonly<{execute: (query: SQL) => PromiseLike<unknown>}>;
export type GrantDatabase = Readonly<{transaction: <T>(work: (tx: GrantExecutor) => Promise<T>) => Promise<T>}>;
export type GrantOptions = Readonly<{enabled?: boolean; companyEnabled?: boolean; loadDatabase?: () => Promise<GrantDatabase>}>;
function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const idRow = z.object({id: z.string().uuid()});
const planRow = z.object({seatAllowance: z.coerce.number().int().nonnegative()});

function requireCompanyCapability(input: MembershipGrantInput, enabled = process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED === "true") {
  if (input.target.kind === "company" && !enabled) throw new Error("GRANT_COMPANY_POLICY_UNAPPROVED");
}

/** The single grant write, shared by the single action and the T13 item transaction. */
export async function insertFiniteGrant(tx: GrantExecutor, actor: Actor, input: MembershipGrantInput, companyEnabled?: boolean): Promise<string> {
  if (actor.kind !== "superadmin") forbidden();
  requireCompanyCapability(input, companyEnabled);
  const targetId = input.target.kind === "profile" ? input.target.profileId : input.target.companyId;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`finite-grant:${input.target.kind}:${targetId}`}))`);
  const target = input.target.kind === "profile"
    ? rows(await tx.execute(sql`SELECT ${profiles.id} AS id FROM ${profiles} WHERE ${profiles.id} = ${targetId} AND ${profiles.role} = 'member' LIMIT 1 FOR SHARE`))
    : rows(await tx.execute(sql`SELECT ${companies.id} AS id FROM ${companies} WHERE ${companies.id} = ${targetId}::uuid LIMIT 1 FOR SHARE`));
  if (!target.length) throw new Error(input.target.kind === "profile" ? "GRANT_TARGET_NOT_MEMBER" : "GRANT_COMPANY_NOT_FOUND");
  const scope = input.target.kind === "profile" ? sql`${memberships.ownerUserId} = ${targetId}` : sql`${memberships.companyId} = ${targetId}::uuid`;
  const live = rows(await tx.execute(sql`SELECT ${memberships.id} AS id FROM ${memberships} WHERE ${scope} AND ${memberships.status} NOT IN ('cancelled','expired') LIMIT 1 FOR UPDATE`));
  if (live.length) throw new Error("MEMBERSHIP_ALREADY_EXISTS");
  const plan = rows(await tx.execute(sql`SELECT ${membershipPlans.seatAllowance} AS "seatAllowance" FROM ${membershipPlans} WHERE ${membershipPlans.code} = ${input.planCode} LIMIT 1`));
  if (!plan.length) throw new Error("MEMBERSHIP_PLAN_NOT_FOUND");
  const seatLimit = planRow.parse(plan[0]).seatAllowance;
  const profileId = input.target.kind === "profile" ? input.target.profileId : null;
  const companyId = input.target.kind === "company" ? input.target.companyId : null;
  const grant = idRow.parse(rows(await tx.execute(sql`INSERT INTO ${memberships} (owner_user_id, company_id, plan_code, status, seat_limit, grant_effective_at, grant_expires_at, grant_reason, grant_actor_profile_id) VALUES (${profileId}, ${companyId}::uuid, ${input.planCode}, 'active', ${seatLimit}, ${new Date(input.effectiveAt)}, ${new Date(input.expiresAt)}, ${input.reason}, ${actor.profileId}) RETURNING ${memberships.id} AS id`))[0]);
  await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'membership.grant.created', 'membership', ${grant.id}, jsonb_build_object('targetKind',${input.target.kind}::text,'targetId',${targetId}::text,'planCode',${input.planCode}::text,'effectiveAt',${input.effectiveAt}::text,'expiresAt',${input.expiresAt}::text))`);
  return grant.id;
}

export async function grantMembership(actor: Actor, input: unknown, options: GrantOptions = {}): Promise<string> {
  if (actor.kind !== "superadmin") forbidden();
  if (!(options.enabled ?? process.env.MEMBERSHIP_GRANTS_ENABLED === "true")) throw new Error("MEMBERSHIP_GRANTS_DISABLED");
  const parsed = grantInputSchema.parse(input);
  requireCompanyCapability(parsed, options.companyEnabled);
  const db = await (options.loadDatabase ?? (async () => await getDb() as unknown as GrantDatabase))();
  try {return await db.transaction((tx) => insertFiniteGrant(tx, actor, parsed, options.companyEnabled));}
  catch (error) {
    // Drizzle may wrap the PostgreSQL constraint violation as its cause.
    const failure = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (failure && typeof failure === "object" && "code" in failure && failure.code === "23505" && "constraint" in failure && ["memberships_owner_live_unique", "memberships_company_live_unique"].includes(String(failure.constraint))) throw new Error("MEMBERSHIP_ALREADY_EXISTS");
    throw error;
  }
}
