import "server-only";

import {eq} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, membershipPlans, memberships, type Membership} from "@/lib/db/server-schema";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

/**
 * What staff may set when comping a membership, and deliberately no more.
 *
 * Excluded, each for its own reason:
 * - `status` — every value other than `active` (`pending_payment`, `pending_review`,
 *   `past_due`, `cancel_at_period_end`) is a billing state the Stripe webhook owns.
 *   Letting staff type one is how a membership reaches a state no payment event will
 *   ever move it out of. A comp is active by definition.
 * - `companyId` — `memberships_target_check` allows an owner **xor** a company, so a
 *   form offering both would produce a row the database refuses. A comp targets a person.
 * - `seatLimit` — derived from the plan's `seatAllowance` below. A hand-typed seat count
 *   silently diverges from what the plan sells.
 * - `stripeCustomerId`, `stripeSubscriptionId`, `billingPeriod*`, `cancelAtPeriodEnd` —
 *   billing facts. A comp is the absence of billing, not an edit to it.
 */
const compSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  planCode: z.enum(MEMBERSHIP_PLAN_CODES),
}).strict();

export type CompMembershipInput = z.output<typeof compSchema>;

export type CompMembershipDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  planSeatAllowance: (planCode: CompMembershipInput["planCode"]) => Promise<number | null>;
  insertMembership: (input: Readonly<{
    ownerUserId: string;
    companyId: null;
    planCode: CompMembershipInput["planCode"];
    status: "active";
    seatLimit: number;
  }>) => Promise<Membership>;
  insertAudit: (input: Readonly<{
    actorUserId: string;
    actorType: AdminActor["kind"];
    action: "membership.comped";
    targetType: "membership";
    targetId: string;
    metadata: Record<string, unknown>;
  }>) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

async function defaultDependencies(): Promise<CompMembershipDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    planSeatAllowance: async (planCode) =>
      (await tx.select({seatAllowance: membershipPlans.seatAllowance})
        .from(membershipPlans).where(eq(membershipPlans.code, planCode)).limit(1))[0]?.seatAllowance ?? null,
    insertMembership: async (input) => (await tx.insert(memberships).values(input).returning())[0],
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

/**
 * Grants a membership without a payment — a comp, a founding member, or the repair of a
 * checkout that took money and never activated.
 *
 * `membershipsRepository.create` cannot do this: it refuses any actor that is not
 * `member` or `system`, which is correct for the self-service and webhook paths it
 * serves. Widening it would put a staff-writable door on the member-facing gate, so this
 * is a separate module with its own narrow contract, exactly as `admin-member-profile.ts`
 * is for profile corrections.
 */
export async function compMembership(
  actor: Actor,
  input: unknown,
  dependencies?: CompMembershipDependencies,
): Promise<Membership> {
  requireAdmin(actor);
  const parsed = compSchema.parse(input);
  return (dependencies ?? await defaultDependencies()).transaction(async (transaction) => {
    const seatLimit = await transaction.planSeatAllowance(parsed.planCode);
    // A plan row missing or seatless is a seeding fault, not a membership to guess at.
    if (seatLimit === null) throw new Error("MEMBERSHIP_PLAN_NOT_FOUND");
    const row = await transaction.insertMembership({
      ownerUserId: parsed.profileId,
      companyId: null,
      planCode: parsed.planCode,
      status: "active",
      seatLimit,
    });
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "membership.comped",
      targetType: "membership",
      targetId: row.id,
      metadata: {planCode: parsed.planCode, ownerUserId: parsed.profileId},
    });
    return row;
  });
}

export const adminMembershipRepository = {comp: compMembership};
