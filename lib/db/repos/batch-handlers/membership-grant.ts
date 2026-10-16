import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {companies, membershipPlans, memberships, profiles} from "@/lib/db/server-schema";
import {insertFiniteGrant} from "@/lib/db/repos/membership-grants";
import {grantInputSchema} from "@/lib/membership/grants";

function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const profileRow = z.object({id: z.string(), role: z.string(), name: z.string()});
const companyRow = z.object({id: z.string().uuid(), name: z.string()});
const liveRow = z.object({id: z.string().uuid(), targetId: z.string()});
const planRow = z.object({seatAllowance: z.coerce.number().int().nonnegative()});
function enabled() {return process.env.MEMBERSHIP_GRANTS_ENABLED === "true" && process.env.MEMBERSHIP_GRANT_BATCH_ENABLED === "true";}

export const membershipGrantBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    if (request.operation !== "membership_grant") throw new Error("BATCH_OPERATION_MISMATCH");
    const profileIds = [...new Set(request.targets.flatMap((target) => target.kind === "profile" ? [target.profileId] : []))];
    const companyIds = [...new Set(request.targets.flatMap((target) => target.kind === "company" ? [target.companyId] : []))];
    const profileFacts = profileIds.length ? z.array(profileRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role, ${profiles.displayName} AS name FROM ${profiles} WHERE ${inArray(profiles.id, profileIds)}`))) : [];
    const companyFacts = companyIds.length ? z.array(companyRow).parse(rows(await tx.execute(sql`SELECT ${companies.id} AS id, ${companies.displayName} AS name FROM ${companies} WHERE ${inArray(companies.id, companyIds)}`))) : [];
    const liveProfiles = profileIds.length ? z.array(liveRow).parse(rows(await tx.execute(sql`SELECT ${memberships.id} AS id, ${memberships.ownerUserId} AS "targetId" FROM ${memberships} WHERE ${inArray(memberships.ownerUserId, profileIds)} AND ${memberships.status} NOT IN ('cancelled','expired')`))) : [];
    const liveCompanies = companyIds.length ? z.array(liveRow).parse(rows(await tx.execute(sql`SELECT ${memberships.id} AS id, ${memberships.companyId} AS "targetId" FROM ${memberships} WHERE ${inArray(memberships.companyId, companyIds)} AND ${memberships.status} NOT IN ('cancelled','expired')`))) : [];
    const plan = z.array(planRow).parse(rows(await tx.execute(sql`SELECT ${membershipPlans.seatAllowance} AS "seatAllowance" FROM ${membershipPlans} WHERE ${membershipPlans.code} = ${request.payload.planCode} LIMIT 1`)))[0];
    const profileMap = new Map(profileFacts.map((row) => [row.id, row]));
    const companyMap = new Map(companyFacts.map((row) => [row.id, row]));
    const live = new Map<string, string>([...liveProfiles.map((row) => [`profile:${row.targetId}`, row.id] as const), ...liveCompanies.map((row) => [`company:${row.targetId}`, row.id] as const)]);
    const seen = new Set<string>();
    return request.targets.map((target) => {
      const targetId = target.kind === "profile" ? target.profileId : target.companyId;
      const key = `${target.kind}:${targetId}`;
      const duplicate = seen.has(key);
      seen.add(key);
      const reasonCode = !enabled() || actor.kind !== "superadmin" ? "GRANT_POLICY_DISABLED"
        : target.kind === "company" && process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED !== "true" ? "GRANT_COMPANY_POLICY_UNAPPROVED"
        : duplicate ? "DUPLICATE_TARGET"
        : target.kind === "profile" && profileMap.get(targetId)?.role !== "member" ? "GRANT_TARGET_NOT_MEMBER"
        : target.kind === "company" && !companyMap.has(targetId) ? "GRANT_COMPANY_NOT_FOUND"
        : live.has(key) ? "MEMBERSHIP_ALREADY_EXISTS" : !plan ? "MEMBERSHIP_PLAN_NOT_FOUND" : null;
      return {target: {type: target.kind, id: targetId}, previewStatus: reasonCode ? "blocked" as const : "eligible" as const, eligible: !reasonCode, reasonCode, expectedVersion: "no-live-membership", before: {targetName: (target.kind === "profile" ? profileMap.get(targetId) : companyMap.get(targetId))?.name ?? null, liveMembershipId: live.get(key) ?? null}, after: {planCode: request.payload.planCode, seatLimit: plan?.seatAllowance ?? null, effectiveAt: request.payload.effectiveAt, expiresAt: request.payload.expiresAt, reason: request.payload.reason}};
    });
  },
  async execute(actor, claim, tx) {
    if (claim.operation !== "membership_grant" || claim.request.operation !== "membership_grant") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    if (!enabled() || actor.kind !== "superadmin") return {status: "skipped", reasonCode: "GRANT_POLICY_DISABLED"};
    const target = claim.request.targets.find((target) => target.kind === claim.target.type && (target.kind === "profile" ? target.profileId : target.companyId) === claim.target.id);
    if (!target) return {status: "skipped", reasonCode: "GRANT_TARGET_UNAVAILABLE"};
    const input = grantInputSchema.parse({target, ...claim.request.payload});
    await tx.execute(sql`SAVEPOINT finite_grant_write`);
    try {
      const resultRef = await insertFiniteGrant(tx, actor, input);
      await tx.execute(sql`RELEASE SAVEPOINT finite_grant_write`);
      return {status: "succeeded", resultRef};
    } catch (error) {
      await tx.execute(sql`ROLLBACK TO SAVEPOINT finite_grant_write`);
      await tx.execute(sql`RELEASE SAVEPOINT finite_grant_write`);
      if (error instanceof Error && ["MEMBERSHIP_ALREADY_EXISTS", "GRANT_TARGET_NOT_MEMBER", "GRANT_COMPANY_NOT_FOUND", "GRANT_COMPANY_POLICY_UNAPPROVED", "MEMBERSHIP_PLAN_NOT_FOUND"].includes(error.message)) return {status: "skipped", reasonCode: error.message};
      const failure = error && typeof error === "object" && "cause" in error ? error.cause : error;
      if (failure && typeof failure === "object" && "code" in failure && failure.code === "23505" && "constraint" in failure && ["memberships_owner_live_unique", "memberships_company_live_unique"].includes(String(failure.constraint))) return {status: "skipped", reasonCode: "MEMBERSHIP_ALREADY_EXISTS"};
      throw error;
    }
  },
};
