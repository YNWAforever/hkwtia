import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {membershipPlans, memberships, profiles} from "@/lib/db/server-schema";
import {insertFiniteProfileGrant} from "@/lib/db/repos/membership-grants";
import {grantInputSchema} from "@/lib/membership/grants";

function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const profileRow = z.object({id: z.string(), role: z.string()});
const liveRow = z.object({id: z.string().uuid(), ownerUserId: z.string()});
const planRow = z.object({seatAllowance: z.coerce.number().int().nonnegative()});
function enabled() {return process.env.MEMBERSHIP_GRANTS_ENABLED === "true" && process.env.MEMBERSHIP_GRANT_BATCH_ENABLED === "true";}

export const membershipGrantBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    if (request.operation !== "membership_grant") throw new Error("BATCH_OPERATION_MISMATCH");
    const profileIds = [...new Set(request.targets.flatMap((target) => target.kind === "profile" ? [target.profileId] : []))];
    const profileFacts = profileIds.length ? z.array(profileRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role FROM ${profiles} WHERE ${inArray(profiles.id, profileIds)}`))) : [];
    const liveFacts = profileIds.length ? z.array(liveRow).parse(rows(await tx.execute(sql`SELECT ${memberships.id} AS id, ${memberships.ownerUserId} AS "ownerUserId" FROM ${memberships} WHERE ${inArray(memberships.ownerUserId, profileIds)} AND ${memberships.status} NOT IN ('cancelled','expired')`))) : [];
    const plan = z.array(planRow).parse(rows(await tx.execute(sql`SELECT ${membershipPlans.seatAllowance} AS "seatAllowance" FROM ${membershipPlans} WHERE ${membershipPlans.code} = ${request.payload.planCode} LIMIT 1`)))[0];
    const roles = new Map(profileFacts.map((row) => [row.id, row.role]));
    const live = new Map(liveFacts.map((row) => [row.ownerUserId, row.id]));
    const seen = new Set<string>();
    return request.targets.map((target) => {
      const targetId = target.kind === "profile" ? target.profileId : target.companyId;
      const duplicate = seen.has(`${target.kind}:${targetId}`);
      seen.add(`${target.kind}:${targetId}`);
      const reasonCode = !enabled() || actor.kind !== "superadmin" ? "GRANT_POLICY_DISABLED" : target.kind === "company" ? "GRANT_COMPANY_POLICY_UNAPPROVED" : duplicate ? "DUPLICATE_TARGET" : roles.get(targetId) !== "member" ? "GRANT_TARGET_NOT_MEMBER" : live.has(targetId) ? "MEMBERSHIP_ALREADY_EXISTS" : !plan ? "MEMBERSHIP_PLAN_NOT_FOUND" : null;
      return {target: {type: target.kind, id: targetId}, previewStatus: reasonCode ? "blocked" as const : "eligible" as const, eligible: !reasonCode, reasonCode, expectedVersion: "no-live-membership", before: {liveMembershipId: live.get(targetId) ?? null}, after: {planCode: request.payload.planCode, seatLimit: plan?.seatAllowance ?? null, effectiveAt: request.payload.effectiveAt, expiresAt: request.payload.expiresAt, reason: request.payload.reason}};
    });
  },
  async execute(actor, claim, tx) {
    if (claim.operation !== "membership_grant" || claim.request.operation !== "membership_grant") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    if (!enabled() || actor.kind !== "superadmin") return {status: "skipped", reasonCode: "GRANT_POLICY_DISABLED"};
    if (claim.target.type !== "profile" || !claim.request.targets.some((target) => target.kind === "profile" && target.profileId === claim.target.id)) return {status: "skipped", reasonCode: "GRANT_TARGET_UNAVAILABLE"};
    const input = grantInputSchema.parse({target: {kind: "profile", profileId: claim.target.id}, ...claim.request.payload});
    try {return {status: "succeeded", resultRef: await insertFiniteProfileGrant(tx, actor, input)};}
    catch (error) {
      if (error instanceof Error && ["MEMBERSHIP_ALREADY_EXISTS", "GRANT_TARGET_NOT_MEMBER", "MEMBERSHIP_PLAN_NOT_FOUND"].includes(error.message)) return {status: "skipped", reasonCode: error.message};
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return {status: "skipped", reasonCode: "MEMBERSHIP_ALREADY_EXISTS"};
      throw error;
    }
  },
};
