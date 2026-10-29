import "server-only";

import {randomUUID} from "node:crypto";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import type {OpsImportPlanCode} from "@/lib/admin/imports/membership-decision";
import {ensureOpsMembershipPlan} from "@/lib/db/repos/membership-plans";
import {membershipPlans, memberships, profiles} from "@/lib/db/server-schema";

type Executor = Readonly<{execute: (query: SQL) => PromiseLike<unknown>}>;

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function utcDay(day: string | null): Date | null {
  return day ? new Date(`${day}T00:00:00.000Z`) : null;
}

const planRow = z.object({seatAllowance: z.coerce.number().int().nonnegative()});
const membershipRow = z.object({
  id: z.string().uuid(),
  status: z.string(),
  planCode: z.string(),
  seatLimit: z.coerce.number().int(),
  billingPeriodStart: z.string().nullable(),
  billingPeriodEnd: z.string().nullable(),
});

export type ImportedMembershipWrite = Readonly<{id: string; action: "inserted" | "updated" | "unchanged"}>;

/**
 * Historical rows are not grants and not Stripe subscriptions. memberships
 * requires an owner profile or a company. Legacy IN* member numbers are not
 * profile ids, so the create path inserts a hidden profile shell — no Neon
 * Auth user and no email — and hangs the membership on that new id.
 * individual and platinum plan rows are bootstrapped because 0069 only adds
 * the enum values. The migration has to already be applied; otherwise the
 * enum insert fails and this returns no membership.
 */
export async function loadImportPlanSeat(tx: Executor, planCode: OpsImportPlanCode): Promise<number | null> {
  await ensureOpsMembershipPlan(tx, planCode);
  const plan = rows(await tx.execute(sql`SELECT ${membershipPlans.seatAllowance} AS "seatAllowance" FROM ${membershipPlans} WHERE ${membershipPlans.code} = ${planCode} LIMIT 1`))[0];
  if (!plan) return null;
  return planRow.parse(plan).seatAllowance;
}

export async function insertImportProfileShell(tx: Executor, input: Readonly<{email: string; displayName: string | null; locale: string | null}>): Promise<string> {
  const id = randomUUID();
  const name = (input.displayName?.trim() || input.email).slice(0, 200);
  const locale = input.locale === "zh-HK" ? "zh-HK" : "en";
  // auth_user_id is a private placeholder, not a Neon user. This import does not create a login or send mail.
  await tx.execute(sql`INSERT INTO ${profiles} (id, auth_user_id, email, display_name, role, locale, directory_visible) VALUES (${id}, ${id}, ${input.email}, ${name}, 'member', ${locale}, false)`);
  return id;
}

export async function ensureImportedMembership(tx: Executor, input: Readonly<{profileId: string; planCode: OpsImportPlanCode; status: "active" | "expired"; seatLimit: number; billingPeriodStart: string | null; billingPeriodEnd: string | null}>): Promise<ImportedMembershipWrite> {
  const existing = z.array(membershipRow).parse(rows(await tx.execute(sql`SELECT ${memberships.id} AS id, ${memberships.status} AS status, ${memberships.planCode} AS "planCode", ${memberships.seatLimit} AS "seatLimit", CASE WHEN ${memberships.billingPeriodStart} IS NULL THEN NULL ELSE to_char(${memberships.billingPeriodStart} AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS "billingPeriodStart", CASE WHEN ${memberships.billingPeriodEnd} IS NULL THEN NULL ELSE to_char(${memberships.billingPeriodEnd} AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS "billingPeriodEnd" FROM ${memberships} WHERE ${memberships.ownerUserId} = ${input.profileId} FOR UPDATE`)));
  const live = existing.find((row) => row.status !== "cancelled" && row.status !== "expired");
  const expired = existing.find((row) => row.status === "expired");
  const target = input.status === "active" ? live : live ?? expired;
  const same = target
    && target.planCode === input.planCode
    && target.status === input.status
    && target.seatLimit === input.seatLimit
    && target.billingPeriodStart === input.billingPeriodStart
    && target.billingPeriodEnd === input.billingPeriodEnd;
  if (target && same) return {id: target.id, action: "unchanged"};
  const start = utcDay(input.billingPeriodStart);
  const end = utcDay(input.billingPeriodEnd);
  if (target) {
    await tx.execute(sql`UPDATE ${memberships} SET plan_code = ${input.planCode}, status = ${input.status}, seat_limit = ${input.seatLimit}, billing_interval = 'annual', billing_period_start = ${start}, billing_period_end = ${end}, updated_at = now() WHERE ${memberships.id} = ${target.id}::uuid`);
    return {id: target.id, action: "updated"};
  }
  // A previous expired row stays as history when a later import is active. The live unique index allows that.
  const created = z.object({id: z.string().uuid()}).parse(rows(await tx.execute(sql`INSERT INTO ${memberships} (owner_user_id, plan_code, status, seat_limit, billing_interval, billing_period_start, billing_period_end) VALUES (${input.profileId}, ${input.planCode}, ${input.status}, ${input.seatLimit}, 'annual', ${start}, ${end}) RETURNING ${memberships.id} AS id`))[0]);
  return {id: created.id, action: "inserted"};
}
