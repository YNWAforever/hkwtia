import "server-only";

import {and, eq, exists, isNull, sql} from "drizzle-orm";

import type {Actor, MembershipPlanCode, MembershipRecord} from "@/lib/membership/lifecycle";
import {billingAttempts, companyMembers, memberships, type BillingAttempt} from "@/lib/db/server-schema";
import {forbidden, getDb} from "@/lib/db/repos/common";
import {membershipsRepository} from "@/lib/db/repos/memberships";

export type BillingAttemptClaim = Readonly<{
  attempt: BillingAttempt;
  disposition: "created" | "existing";
  membership: MembershipRecord;
}>;

export type BillingAttemptRecovery = Readonly<{
  attempt: BillingAttempt;
  membership: MembershipRecord;
}>;

export type CheckoutSessionReference = Readonly<{
  stripeCheckoutSessionId: string;
  checkoutUrl: string;
}>;

export type BillingAttemptErrorCode =
  | "MEMBERSHIP_NOT_PENDING_PAYMENT"
  | "PLAN_DOES_NOT_USE_CHECKOUT"
  | "MEMBERSHIP_APPLICATION_REQUIRED"
  | "BILLING_PLAN_CHANGED"
  | "BILLING_ATTEMPT_STALE"
  | "BILLING_ATTEMPT_CREATE_FAILED";

export class BillingAttemptError extends Error {
  constructor(readonly code: BillingAttemptErrorCode) {
    super(code);
    this.name = "BillingAttemptError";
  }
}

type AttemptEndReason = "abandoned" | "expired";
export type RecoveryRequest = Readonly<{
  expectedCurrentAttemptId: string;
  recoveryRequestId: string;
  expectedPlanCode?: MembershipPlanCode;
}>;

type TransactionExecutor = Readonly<{
  execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown>;
}>;

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {code?: unknown; cause?: unknown};
  return candidate.code === "23505" || uniqueViolation(candidate.cause);
}

function validatePrice(attempt: BillingAttempt, priceReference: string): void {
  if (attempt.priceReference !== priceReference) throw new Error("BILLING_ATTEMPT_PRICE_CHANGED");
}

async function activeAttempt(
  db: Awaited<ReturnType<typeof getDb>>,
  membershipId: string,
): Promise<BillingAttempt | null> {
  const rows = await db.select().from(billingAttempts)
    .where(and(eq(billingAttempts.membershipId, membershipId), eq(billingAttempts.state, "active"))).limit(1);
  return rows[0] ?? null;
}

function rawRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as {rows?: unknown}).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function rawAttempt(row: unknown): BillingAttempt | null {
  if (!row) return null;
  if (Array.isArray(row)) {
    const [id, membershipId, attemptNumber, idempotencyKey, priceReference, state,
      stripeCheckoutSessionId, checkoutUrl, recoveryRequestId, createdAt, updatedAt, endedAt] = row;
    return {id, membershipId, attemptNumber, idempotencyKey, priceReference, state,
      stripeCheckoutSessionId, checkoutUrl, recoveryRequestId, createdAt, updatedAt, endedAt} as BillingAttempt;
  }
  const value = row as Record<string, unknown>;
  return {
    id: value.id, membershipId: value.membership_id ?? value.membershipId,
    attemptNumber: value.attempt_number ?? value.attemptNumber,
    idempotencyKey: value.idempotency_key ?? value.idempotencyKey,
    priceReference: value.price_reference ?? value.priceReference, state: value.state,
    stripeCheckoutSessionId: value.stripe_checkout_session_id ?? value.stripeCheckoutSessionId,
    checkoutUrl: value.checkout_url ?? value.checkoutUrl,
    recoveryRequestId: value.recovery_request_id ?? value.recoveryRequestId,
    createdAt: value.created_at ?? value.createdAt, updatedAt: value.updated_at ?? value.updatedAt,
    endedAt: value.ended_at ?? value.endedAt,
  } as BillingAttempt;
}

function rawMembership(row: unknown): MembershipRecord | null {
  if (!row) return null;
  const value = row as Record<string, unknown>;
  return {
    id: value.id, ownerUserId: value.owner_user_id ?? value.ownerUserId,
    companyId: value.company_id ?? value.companyId,
    applicationId: value.application_id ?? value.applicationId,
    planCode: value.plan_code ?? value.planCode, status: value.status,
    seatLimit: value.seat_limit ?? value.seatLimit,
    stripeCustomerId: value.stripe_customer_id ?? value.stripeCustomerId,
    stripeSubscriptionId: value.stripe_subscription_id ?? value.stripeSubscriptionId,
    billingPeriodStart: value.billing_period_start ?? value.billingPeriodStart,
    billingPeriodEnd: value.billing_period_end ?? value.billingPeriodEnd,
  } as MembershipRecord;
}

function attemptError(code: BillingAttemptErrorCode): never {
  throw new BillingAttemptError(code);
}

async function lockCheckoutMembership(
  tx: TransactionExecutor,
  actor: Extract<Actor, {kind: "member"}>,
  membershipId: string,
  expectedPlanCode?: MembershipPlanCode,
): Promise<MembershipRecord> {
  const membership = rawMembership(rawRows(await tx.execute(sql`
    SELECT ${memberships.id} AS id, ${memberships.ownerUserId} AS owner_user_id,
      ${memberships.companyId} AS company_id, ${memberships.applicationId} AS application_id,
      ${memberships.planCode} AS plan_code, ${memberships.status} AS status,
      ${memberships.seatLimit} AS seat_limit, ${memberships.stripeCustomerId} AS stripe_customer_id,
      ${memberships.stripeSubscriptionId} AS stripe_subscription_id,
      ${memberships.billingPeriodStart} AS billing_period_start,
      ${memberships.billingPeriodEnd} AS billing_period_end
    FROM ${memberships}
    WHERE ${memberships.id} = ${membershipId}
      AND (${memberships.ownerUserId} = ${actor.userId} OR EXISTS (
        SELECT 1 FROM ${companyMembers}
        WHERE ${companyMembers.companyId} = ${memberships.companyId}
          AND ${companyMembers.userId} = ${actor.userId}
          AND ${companyMembers.revokedAt} IS NULL
          AND (${companyMembers.role} = ${"owner"} OR ${companyMembers.role} = ${"admin"})
      ))
    FOR UPDATE
  `))[0]);
  if (!membership) forbidden();
  if (membership.status !== "pending_payment") attemptError("MEMBERSHIP_NOT_PENDING_PAYMENT");
  if (membership.planCode !== "startup" && membership.planCode !== "corporate") {
    attemptError("PLAN_DOES_NOT_USE_CHECKOUT");
  }
  if (!membership.applicationId) attemptError("MEMBERSHIP_APPLICATION_REQUIRED");
  if (expectedPlanCode && membership.planCode !== expectedPlanCode) attemptError("BILLING_PLAN_CHANGED");
  return membership;
}

function memberAttemptScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(sql`SELECT 1 FROM ${memberships}
    WHERE ${memberships.id} = ${billingAttempts.membershipId}
      AND (${memberships.ownerUserId} = ${actor.userId} OR EXISTS (
        SELECT 1 FROM ${companyMembers}
        WHERE ${companyMembers.companyId} = ${memberships.companyId}
          AND ${companyMembers.userId} = ${actor.userId}
          AND ${companyMembers.revokedAt} IS NULL
          AND (${companyMembers.role} = ${"owner"} OR ${companyMembers.role} = ${"admin"})
      ))`);
}

export const billingAttemptsRepository = {
  async getActive(actor: Actor, membershipId: string): Promise<BillingAttempt | null> {
    if (actor.kind !== "member") forbidden();
    await membershipsRepository.getById(actor, membershipId);
    return activeAttempt(await getDb(), membershipId);
  },

  async getById(actor: Actor, attemptId: string): Promise<BillingAttempt | null> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const rows = await db.select().from(billingAttempts)
      .where(and(eq(billingAttempts.id, attemptId), memberAttemptScope(actor))).limit(1);
    return rows[0] ?? null;
  },

  async claimActive(
    actor: Actor,
    membershipId: string,
    priceReference: string,
    expectedPlanCode?: MembershipPlanCode,
  ): Promise<BillingAttemptClaim> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    return db.transaction(async (tx) => {
      const membership = await lockCheckoutMembership(tx, actor, membershipId, expectedPlanCode);
      const existing = rawAttempt(rawRows(await tx.execute(sql`SELECT * FROM ${billingAttempts}
        WHERE ${billingAttempts.membershipId} = ${membershipId} AND ${billingAttempts.state} = 'active' LIMIT 1`))[0]);
      if (existing) {
        validatePrice(existing, priceReference);
        return {attempt: existing, disposition: "existing", membership};
      }
      const prior = rawRows(await tx.execute(sql`SELECT ${billingAttempts.attemptNumber} AS attempt_number
        FROM ${billingAttempts} WHERE ${billingAttempts.membershipId} = ${membershipId}
        ORDER BY ${billingAttempts.attemptNumber} DESC LIMIT 1`))[0] as Record<string, unknown> | undefined;
      const attemptNumber = Number(prior?.attempt_number ?? 0) + 1;
      try {
        const attempt = rawAttempt(rawRows(await tx.execute(sql`INSERT INTO ${billingAttempts}
          (membership_id, attempt_number, idempotency_key, price_reference)
          VALUES (${membershipId}, ${attemptNumber}, ${`membership-checkout:${membershipId}:${attemptNumber}`}, ${priceReference})
          RETURNING *`))[0]);
        if (!attempt) attemptError("BILLING_ATTEMPT_CREATE_FAILED");
        return {attempt, disposition: "created", membership};
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const winner = rawAttempt(rawRows(await tx.execute(sql`SELECT * FROM ${billingAttempts}
          WHERE ${billingAttempts.membershipId} = ${membershipId} AND ${billingAttempts.state} = 'active' LIMIT 1`))[0]);
        if (!winner) throw error;
        validatePrice(winner, priceReference);
        return {attempt: winner, disposition: "existing", membership};
      }
    });
  },

  async attachSession(actor: Actor, attemptId: string, reference: CheckoutSessionReference): Promise<BillingAttempt> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const rows = await db.update(billingAttempts).set({
      stripeCheckoutSessionId: reference.stripeCheckoutSessionId,
      checkoutUrl: reference.checkoutUrl, updatedAt: new Date(),
    }).where(and(eq(billingAttempts.id, attemptId), eq(billingAttempts.state, "active"),
      isNull(billingAttempts.stripeCheckoutSessionId), memberAttemptScope(actor))).returning();
    if (!rows[0]) forbidden();
    return rows[0];
  },

  async startNewAttempt(
    actor: Actor,
    membershipId: string,
    priceReference: string,
    reason: AttemptEndReason,
    request: RecoveryRequest,
  ): Promise<BillingAttemptRecovery> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    return db.transaction(async (tx) => {
      const membership = await lockCheckoutMembership(tx, actor, membershipId, request.expectedPlanCode);
      const replay = rawAttempt(rawRows(await tx.execute(sql`SELECT * FROM ${billingAttempts}
        WHERE ${billingAttempts.membershipId} = ${membershipId}
          AND ${billingAttempts.recoveryRequestId} = ${request.recoveryRequestId} LIMIT 1`))[0]);
      if (replay) return {attempt: replay, membership};
      const current = rawAttempt(rawRows(await tx.execute(sql`SELECT * FROM ${billingAttempts}
        WHERE ${billingAttempts.membershipId} = ${membershipId} AND ${billingAttempts.state} = 'active' LIMIT 1`))[0]);
      if (!current || current.id !== request.expectedCurrentAttemptId) attemptError("BILLING_ATTEMPT_STALE");
      const ended = rawRows(await tx.execute(sql`UPDATE ${billingAttempts}
        SET state = ${reason}, ended_at = now(), updated_at = now()
        WHERE ${billingAttempts.id} = ${request.expectedCurrentAttemptId}
          AND ${billingAttempts.state} = 'active' RETURNING id`));
      if (!ended[0]) attemptError("BILLING_ATTEMPT_STALE");
      const attemptNumber = current.attemptNumber + 1;
      const inserted = rawAttempt(rawRows(await tx.execute(sql`INSERT INTO ${billingAttempts}
        (membership_id, attempt_number, idempotency_key, price_reference, recovery_request_id)
        VALUES (${membershipId}, ${attemptNumber}, ${`membership-checkout:${membershipId}:${attemptNumber}`},
          ${priceReference}, ${request.recoveryRequestId}) RETURNING *`))[0]);
      if (!inserted) attemptError("BILLING_ATTEMPT_CREATE_FAILED");
      return {attempt: inserted, membership};
    });
  },
};

export const billingAttemptsRepo = billingAttemptsRepository;
