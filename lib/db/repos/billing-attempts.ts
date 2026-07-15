import "server-only";

import {and, desc, eq, exists, isNull, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {
  billingAttempts,
  companyMembers,
  memberships,
  type BillingAttempt,
} from "@/lib/db/server-schema";
import {forbidden, getDb} from "@/lib/db/repos/common";
import {membershipsRepository} from "@/lib/db/repos/memberships";

export type BillingAttemptClaim = Readonly<{
  attempt: BillingAttempt;
  disposition: "created" | "existing";
}>;

export type CheckoutSessionReference = Readonly<{
  stripeCheckoutSessionId: string;
  checkoutUrl: string;
}>;

type AttemptEndReason = "abandoned" | "expired";

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
  const rows = await db
    .select()
    .from(billingAttempts)
    .where(and(eq(billingAttempts.membershipId, membershipId), eq(billingAttempts.state, "active")))
    .limit(1);
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
      stripeCheckoutSessionId, checkoutUrl, createdAt, updatedAt, endedAt] = row;
    return {id, membershipId, attemptNumber, idempotencyKey, priceReference, state,
      stripeCheckoutSessionId, checkoutUrl, createdAt, updatedAt, endedAt} as BillingAttempt;
  }
  const value = row as Record<string, unknown>;
  return {
    id: value.id,
    membershipId: value.membership_id ?? value.membershipId,
    attemptNumber: value.attempt_number ?? value.attemptNumber,
    idempotencyKey: value.idempotency_key ?? value.idempotencyKey,
    priceReference: value.price_reference ?? value.priceReference,
    state: value.state,
    stripeCheckoutSessionId: value.stripe_checkout_session_id ?? value.stripeCheckoutSessionId,
    checkoutUrl: value.checkout_url ?? value.checkoutUrl,
    createdAt: value.created_at ?? value.createdAt,
    updatedAt: value.updated_at ?? value.updatedAt,
    endedAt: value.ended_at ?? value.endedAt,
  } as BillingAttempt;
}

function memberAttemptScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(sql`
    SELECT 1 FROM ${memberships}
    WHERE ${memberships.id} = ${billingAttempts.membershipId}
      AND (
        ${memberships.ownerUserId} = ${actor.userId}
        OR EXISTS (
          SELECT 1 FROM ${companyMembers}
          WHERE ${companyMembers.companyId} = ${memberships.companyId}
            AND ${companyMembers.userId} = ${actor.userId}
            AND ${companyMembers.revokedAt} IS NULL
        )
      )
  `);
}

export const billingAttemptsRepository = {
  async getActive(actor: Actor, membershipId: string): Promise<BillingAttempt | null> {
    if (actor.kind === "anonymous") forbidden();
    await membershipsRepository.getById(actor, membershipId);
    const db = await getDb();
    return activeAttempt(db, membershipId);
  },

  async claimActive(actor: Actor, membershipId: string, priceReference: string): Promise<BillingAttemptClaim> {
    if (actor.kind === "anonymous") forbidden();
    await membershipsRepository.getById(actor, membershipId);
    const db = await getDb();
    const existing = await activeAttempt(db, membershipId);
    if (existing) {
      validatePrice(existing, priceReference);
      return {attempt: existing, disposition: "existing"};
    }

    const prior = await db
      .select({attemptNumber: billingAttempts.attemptNumber})
      .from(billingAttempts)
      .where(eq(billingAttempts.membershipId, membershipId))
      .orderBy(desc(billingAttempts.attemptNumber))
      .limit(1);
    const attemptNumber = (prior[0]?.attemptNumber ?? 0) + 1;

    try {
      const rows = await db.insert(billingAttempts).values({
        membershipId,
        attemptNumber,
        idempotencyKey: `membership-checkout:${membershipId}:${attemptNumber}`,
        priceReference,
      }).returning();
      return {attempt: rows[0], disposition: "created"};
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      const winner = await activeAttempt(db, membershipId);
      if (!winner) throw error;
      validatePrice(winner, priceReference);
      return {attempt: winner, disposition: "existing"};
    }
  },

  async attachSession(
    actor: Actor,
    attemptId: string,
    reference: CheckoutSessionReference,
  ): Promise<BillingAttempt> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const scope = actor.kind === "system" ? sql`true` : memberAttemptScope(actor);
    const rows = await db.update(billingAttempts).set({
      stripeCheckoutSessionId: reference.stripeCheckoutSessionId,
      checkoutUrl: reference.checkoutUrl,
      updatedAt: new Date(),
    }).where(and(
      eq(billingAttempts.id, attemptId),
      eq(billingAttempts.state, "active"),
      isNull(billingAttempts.stripeCheckoutSessionId),
      scope,
    )).returning();
    if (!rows[0]) forbidden();
    return rows[0];
  },

  async startNewAttempt(
    actor: Actor,
    membershipId: string,
    priceReference: string,
    reason: AttemptEndReason,
  ): Promise<BillingAttempt> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const result = await db.execute(sql`
      WITH accessible_membership AS (
        SELECT ${memberships.id} AS membership_id
        FROM ${memberships}
        WHERE ${memberships.id} = ${membershipId}
          AND (
            ${memberships.ownerUserId} = ${actor.userId}
            OR EXISTS (
              SELECT 1 FROM ${companyMembers}
              WHERE ${companyMembers.companyId} = ${memberships.companyId}
                AND ${companyMembers.userId} = ${actor.userId}
                AND ${companyMembers.revokedAt} IS NULL
            )
          )
      ), ended AS (
        UPDATE ${billingAttempts}
        SET state = ${reason}, ended_at = now(), updated_at = now()
        WHERE membership_id IN (SELECT membership_id FROM accessible_membership)
          AND state = 'active'
        RETURNING membership_id
      ), next_attempt AS (
        SELECT accessible_membership.membership_id,
          COALESCE(MAX(previous.attempt_number), 0)::integer + 1 AS attempt_number
        FROM accessible_membership
        LEFT JOIN ${billingAttempts} previous
          ON previous.membership_id = accessible_membership.membership_id
        GROUP BY accessible_membership.membership_id
      ), inserted AS (
        INSERT INTO ${billingAttempts} (membership_id, attempt_number, idempotency_key, price_reference)
        SELECT membership_id, attempt_number,
          ${`membership-checkout:${membershipId}:`} || attempt_number::text,
          ${priceReference}
        FROM next_attempt
        RETURNING id, membership_id, attempt_number, idempotency_key, price_reference, state,
          stripe_checkout_session_id, checkout_url, created_at, updated_at, ended_at
      )
      SELECT * FROM inserted
    `);
    const attempt = rawAttempt(rawRows(result)[0]);
    if (!attempt) forbidden();
    return attempt;
  },
};

export const billingAttemptsRepo = billingAttemptsRepository;
