import "server-only";

import {randomUUID} from "node:crypto";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {opsTier} from "@/config/membership-journey";
import type {MembershipImportDecision, OpsImportPlanCode} from "@/lib/admin/imports/membership-decision";
import {ensureOpsMembershipPlan} from "@/lib/db/repos/membership-plans";
import {auditEvents, contacts, memberOperationsMetadata, membershipPlans, memberships, profiles} from "@/lib/db/server-schema";

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

function textArraySql(values: readonly string[]): SQL {
  return values.length ? sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]` : sql`ARRAY[]::text[]`;
}

export type ImportWriteActor = Readonly<{profileId: string; kind: string}>;

const createResult = z.object({outcome: z.enum(["created", "occupied", "owner_invalid"]), contactId: z.string().uuid().nullable(), membershipId: z.string().uuid().nullable(), membershipAction: z.enum(["inserted", "updated", "unchanged"]).nullable()});
const updateResult = z.object({outcome: z.enum(["updated", "conflict", "owner_invalid"]), membershipId: z.string().uuid().nullable(), membershipAction: z.enum(["inserted", "updated", "unchanged"]).nullable()});

/**
 * One statement for the create path. The Neon serverless driver sends each
 * `tx.execute` as its own websocket round trip, and a membership create was
 * previously a dozen of those in series.
 */
export async function commitImportedCreate(tx: Executor, input: Readonly<{actor: ImportWriteActor; runId: string; rowNumber: number; email: string; displayName: string | null; profileName: string; profileLocale: string; contactLocale: string; stage: string; ownerId: string | null; tags: readonly string[]; profileId: string | null; decision: MembershipImportDecision | null; planCode: OpsImportPlanCode | null; membershipStatus: "active" | "expired" | null; seat: number | null; billingPeriodStart: string | null; billingPeriodEnd: string | null}>): Promise<z.infer<typeof createResult>> {
  const tags = textArraySql(input.tags);
  const start = utcDay(input.billingPeriodStart);
  const end = utcDay(input.billingPeriodEnd);
  const bootstrapCode = input.planCode === "individual" || input.planCode === "platinum" ? input.planCode : null;
  const tier = bootstrapCode ? opsTier(bootstrapCode) : null;
  const planSeat = tier ? (tier.collectsCompany ? 25 : 1) : null;
  const bootstrap = bootstrapCode !== null;
  const withMembership = Boolean(input.profileId && input.planCode && input.membershipStatus && input.seat !== null && input.decision);
  const planCte = withMembership && bootstrap ? sql`plan_ready AS (
      INSERT INTO ${membershipPlans} (code, audience, billing_behavior, seat_allowance, annual_price_hkd, active)
      SELECT ${input.planCode}, ${input.planCode}, 'checkout', ${planSeat}, ${tier?.annualPriceHkd ?? null}, true
      WHERE NOT EXISTS (SELECT 1 FROM occupied) AND (SELECT ok FROM owner_ok)
      ON CONFLICT (code) DO NOTHING
      RETURNING ${membershipPlans.code} AS code
    ),` : sql``;
  const membershipCtes = withMembership ? sql`${planCte}
    existing_membership AS (
      SELECT m.id, m.status, m.plan_code, m.seat_limit,
        CASE WHEN m.billing_period_start IS NULL THEN NULL ELSE to_char(m.billing_period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS start_day,
        CASE WHEN m.billing_period_end IS NULL THEN NULL ELSE to_char(m.billing_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS end_day
      FROM ${memberships} m
      JOIN shell s ON m.owner_user_id = s.id
      FOR UPDATE OF m
    ),
    target AS (
      SELECT id, status, plan_code, seat_limit, start_day, end_day FROM (
        SELECT 1 AS priority, e.id, e.status, e.plan_code, e.seat_limit, e.start_day, e.end_day FROM existing_membership e WHERE e.status NOT IN ('cancelled', 'expired')
        UNION ALL
        SELECT 2, e.id, e.status, e.plan_code, e.seat_limit, e.start_day, e.end_day FROM existing_membership e WHERE ${input.membershipStatus}::text <> 'active' AND e.status = 'expired'
      ) ranked
      ORDER BY priority
      LIMIT 1
    ),
    same AS (
      SELECT id FROM target
      WHERE plan_code = ${input.planCode} AND status = ${input.membershipStatus} AND seat_limit = ${input.seat}
        AND start_day IS NOT DISTINCT FROM ${input.billingPeriodStart} AND end_day IS NOT DISTINCT FROM ${input.billingPeriodEnd}
    ),
    updated_membership AS (
      UPDATE ${memberships} SET plan_code = ${input.planCode}, status = ${input.membershipStatus}, seat_limit = ${input.seat}, billing_interval = 'annual', billing_period_start = ${start}, billing_period_end = ${end}, updated_at = now()
      WHERE id = (SELECT id FROM target) AND NOT EXISTS (SELECT 1 FROM same)
      RETURNING id, 'updated'::text AS action
    ),
    inserted_membership AS (
      INSERT INTO ${memberships} (owner_user_id, plan_code, status, seat_limit, billing_interval, billing_period_start, billing_period_end)
      SELECT s.id, ${input.planCode}, ${input.membershipStatus}, ${input.seat}, 'annual', ${start}, ${end}
      FROM shell s
      ${bootstrap ? sql`CROSS JOIN (SELECT code FROM plan_ready UNION ALL SELECT ${input.planCode}::text WHERE NOT EXISTS (SELECT 1 FROM plan_ready)) plan_code` : sql``}
      WHERE NOT EXISTS (SELECT 1 FROM target)
      RETURNING id, 'inserted'::text AS action
    ),
    membership_write AS (
      SELECT id, action FROM updated_membership
      UNION ALL SELECT id, action FROM inserted_membership
      UNION ALL SELECT id, 'unchanged'::text AS action FROM same
    ),` : sql``;
  const auditMetadata = input.decision
    ? sql`jsonb_build_object('runId', ${input.runId}::text, 'rowNumber', ${input.rowNumber}::int, 'outcome', ${input.decision.outcome}::text, 'planCode', ${input.decision.planCode}::text, 'membershipStatus', ${input.decision.membershipStatus}::text, 'membershipId', ${withMembership ? sql`mw.id::text` : sql`NULL::text`}, 'membershipAction', ${withMembership ? sql`mw.action` : sql`NULL::text`}, 'fields', '[]'::jsonb)`
    : sql`jsonb_build_object('runId', ${input.runId}::text, 'rowNumber', ${input.rowNumber}::int)`;
  const membershipJoin = withMembership ? sql`LEFT JOIN membership_write mw ON true` : sql``;
  const parsed = createResult.parse(rows(await tx.execute(sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(hashtext(${input.email}))
    ),
    occupied AS (
      SELECT 1 AS hit FROM ${profiles} p WHERE lower(p.email) = ${input.email} AND EXISTS (SELECT 1 FROM locked)
      UNION ALL
      SELECT 1 FROM ${contacts} c WHERE lower(c.email) = ${input.email} AND EXISTS (SELECT 1 FROM locked)
      LIMIT 1
    ),
    owner_ok AS (
      SELECT (${input.ownerId}::text IS NULL OR EXISTS (SELECT 1 FROM ${profiles} owner WHERE owner.id = ${input.ownerId} AND owner.role IN ('staff', 'exco', 'superadmin'))) AS ok
    ),
    shell AS (
      INSERT INTO ${profiles} (id, auth_user_id, email, display_name, role, locale, directory_visible)
      SELECT ${input.profileId}, ${input.profileId}, ${input.email}, ${input.profileName}, 'member', ${input.profileLocale}, false
      WHERE ${input.profileId}::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM occupied) AND (SELECT ok FROM owner_ok)
      RETURNING id
    ),
    ${membershipCtes}
    created_contact AS (
      INSERT INTO ${contacts} (profile_id, display_name, email, source, stage, owner_profile_id, tags, locale)
      SELECT ${withMembership ? sql`s.id` : sql`NULL::text`}, ${input.displayName}, ${input.email}, 'import', ${input.stage}, ${input.ownerId}, ${tags}, ${input.contactLocale}
      FROM ${withMembership ? sql`shell s` : sql`(SELECT 1) AS gate`}
      WHERE NOT EXISTS (SELECT 1 FROM occupied) AND (SELECT ok FROM owner_ok)
      RETURNING id
    ),
    audited AS (
      INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
      SELECT ${input.actor.profileId}, ${input.actor.kind}, 'member.import.row.committed', 'contact', c.id::text, ${auditMetadata}
      FROM created_contact c
      ${membershipJoin}
      RETURNING target_id
    )
    SELECT CASE WHEN NOT (SELECT ok FROM owner_ok) THEN 'owner_invalid' WHEN EXISTS (SELECT 1 FROM occupied) THEN 'occupied' ELSE 'created' END AS outcome,
      (SELECT id FROM created_contact) AS "contactId",
      ${withMembership ? sql`(SELECT id FROM membership_write)` : sql`NULL::uuid`} AS "membershipId",
      ${withMembership ? sql`(SELECT action FROM membership_write)` : sql`NULL::text`} AS "membershipAction",
      (SELECT count(*) FROM audited) AS audited_count
  `))[0]);
  if (parsed?.outcome === "created" && !parsed.contactId) throw new Error("IMPORT_WRITE_INCOMPLETE");
  if (!parsed) throw new Error("IMPORT_WRITE_INCOMPLETE");
  return parsed;
}

export async function commitImportedUpdate(tx: Executor, input: Readonly<{actor: ImportWriteActor; runId: string; rowNumber: number; profileId: string; email: string | null; expectedVersion: string; locale: string | null; ownerId: string | null; hasTags: boolean; tags: readonly string[]; touchMetadata: boolean; decision: MembershipImportDecision | null; planCode: OpsImportPlanCode | null; membershipStatus: "active" | "expired" | null; seat: number | null; billingPeriodStart: string | null; billingPeriodEnd: string | null}>): Promise<z.infer<typeof updateResult>> {
  const tags = textArraySql(input.tags);
  const start = utcDay(input.billingPeriodStart);
  const end = utcDay(input.billingPeriodEnd);
  const withMembership = Boolean(input.planCode && input.membershipStatus && input.seat !== null && input.decision);
  const bootstrapCode = input.planCode === "individual" || input.planCode === "platinum" ? input.planCode : null;
  const bootstrap = bootstrapCode !== null;
  const tier = bootstrapCode ? opsTier(bootstrapCode) : null;
  const planSeat = tier ? (tier.collectsCompany ? 25 : 1) : null;
  const metaCte = input.touchMetadata ? sql`meta_existing AS (
      SELECT ${memberOperationsMetadata.tags} AS tags, ${memberOperationsMetadata.ownerProfileId} AS owner_profile_id FROM ${memberOperationsMetadata} WHERE ${memberOperationsMetadata.profileId} = ${input.profileId}
    ),
    meta_write AS (
      INSERT INTO ${memberOperationsMetadata} (profile_id, tags, owner_profile_id, updated_at)
      SELECT ${input.profileId}, CASE WHEN ${input.hasTags} THEN ${tags} ELSE coalesce((SELECT tags FROM meta_existing), ARRAY[]::text[]) END, CASE WHEN ${input.ownerId}::text IS NOT NULL THEN ${input.ownerId} ELSE (SELECT owner_profile_id FROM meta_existing) END, now()
      FROM profile_write
      ON CONFLICT (profile_id) DO UPDATE SET tags = EXCLUDED.tags, owner_profile_id = EXCLUDED.owner_profile_id, updated_at = now()
      RETURNING profile_id
    ),` : sql``;
  const planCte = withMembership && bootstrap ? sql`plan_ready AS (
      INSERT INTO ${membershipPlans} (code, audience, billing_behavior, seat_allowance, annual_price_hkd, active)
      SELECT ${input.planCode}, ${input.planCode}, 'checkout', ${planSeat}, ${tier?.annualPriceHkd ?? null}, true
      FROM profile_write
      ON CONFLICT (code) DO NOTHING
      RETURNING ${membershipPlans.code} AS code
    ),` : sql``;
  const membershipCtes = withMembership ? sql`${planCte}
    existing_membership AS (
      SELECT m.id, m.status, m.plan_code, m.seat_limit,
        CASE WHEN m.billing_period_start IS NULL THEN NULL ELSE to_char(m.billing_period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS start_day,
        CASE WHEN m.billing_period_end IS NULL THEN NULL ELSE to_char(m.billing_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS end_day
      FROM ${memberships} m
      JOIN profile_write pw ON m.owner_user_id = pw.id
      FOR UPDATE OF m
    ),
    target AS (
      SELECT id, status, plan_code, seat_limit, start_day, end_day FROM (
        SELECT 1 AS priority, e.id, e.status, e.plan_code, e.seat_limit, e.start_day, e.end_day FROM existing_membership e WHERE e.status NOT IN ('cancelled', 'expired')
        UNION ALL
        SELECT 2, e.id, e.status, e.plan_code, e.seat_limit, e.start_day, e.end_day FROM existing_membership e WHERE ${input.membershipStatus}::text <> 'active' AND e.status = 'expired'
      ) ranked
      ORDER BY priority
      LIMIT 1
    ),
    same AS (
      SELECT id FROM target
      WHERE plan_code = ${input.planCode} AND status = ${input.membershipStatus} AND seat_limit = ${input.seat}
        AND start_day IS NOT DISTINCT FROM ${input.billingPeriodStart} AND end_day IS NOT DISTINCT FROM ${input.billingPeriodEnd}
    ),
    updated_membership AS (
      UPDATE ${memberships} SET plan_code = ${input.planCode}, status = ${input.membershipStatus}, seat_limit = ${input.seat}, billing_interval = 'annual', billing_period_start = ${start}, billing_period_end = ${end}, updated_at = now()
      WHERE id = (SELECT id FROM target) AND NOT EXISTS (SELECT 1 FROM same)
      RETURNING id, 'updated'::text AS action
    ),
    inserted_membership AS (
      INSERT INTO ${memberships} (owner_user_id, plan_code, status, seat_limit, billing_interval, billing_period_start, billing_period_end)
      SELECT pw.id, ${input.planCode}, ${input.membershipStatus}, ${input.seat}, 'annual', ${start}, ${end}
      FROM profile_write pw
      ${bootstrap ? sql`CROSS JOIN (SELECT code FROM plan_ready UNION ALL SELECT ${input.planCode}::text WHERE NOT EXISTS (SELECT 1 FROM plan_ready)) plan_code` : sql``}
      WHERE NOT EXISTS (SELECT 1 FROM target)
      RETURNING id, 'inserted'::text AS action
    ),
    membership_write AS (
      SELECT id, action FROM updated_membership
      UNION ALL SELECT id, action FROM inserted_membership
      UNION ALL SELECT id, 'unchanged'::text AS action FROM same
    ),` : sql``;
  const auditMetadata = input.decision
    ? sql`jsonb_build_object('runId', ${input.runId}::text, 'rowNumber', ${input.rowNumber}::int, 'outcome', ${input.decision.outcome}::text, 'planCode', ${input.decision.planCode}::text, 'membershipStatus', ${input.decision.membershipStatus}::text, 'membershipId', ${withMembership ? sql`mw.id::text` : sql`NULL::text`}, 'membershipAction', ${withMembership ? sql`mw.action` : sql`NULL::text`}, 'fields', jsonb_build_array('locale','tags','owner'))`
    : sql`jsonb_build_object('runId', ${input.runId}::text, 'rowNumber', ${input.rowNumber}::int, 'fields', jsonb_build_array('locale','tags','owner'))`;
  const membershipJoin = withMembership ? sql`LEFT JOIN membership_write mw ON true` : sql``;
  const metaTouch = input.touchMetadata ? sql`(SELECT count(*) FROM meta_write)` : sql`0`;
  const parsed = updateResult.parse(rows(await tx.execute(sql`
    WITH current AS (
      SELECT ${profiles.id} AS id, ${profiles.role} AS role, lower(${profiles.email}) AS email, ${profiles.updatedAt}::text AS updated_at
      FROM ${profiles} WHERE ${profiles.id} = ${input.profileId} FOR UPDATE
    ),
    owner_ok AS (
      SELECT (${input.ownerId}::text IS NULL OR EXISTS (SELECT 1 FROM ${profiles} owner WHERE owner.id = ${input.ownerId} AND owner.role IN ('staff', 'exco', 'superadmin'))) AS ok
    ),
    eligible AS (
      SELECT id FROM current
      WHERE role = 'member' AND updated_at = ${input.expectedVersion} AND (${input.email}::text IS NULL OR email = ${input.email})
    ),
    profile_write AS (
      UPDATE ${profiles} SET locale = coalesce(${input.locale}, locale), updated_at = now()
      WHERE id IN (SELECT id FROM eligible) AND (SELECT ok FROM owner_ok)
      RETURNING id
    ),
    ${metaCte}
    ${membershipCtes}
    audited AS (
      INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
      SELECT ${input.actor.profileId}, ${input.actor.kind}, 'member.import.row.committed', 'profile', ${input.profileId}, ${auditMetadata}
      FROM profile_write pw
      ${membershipJoin}
      RETURNING target_id
    )
    SELECT CASE WHEN NOT (SELECT ok FROM owner_ok) THEN 'owner_invalid' WHEN NOT EXISTS (SELECT 1 FROM eligible) THEN 'conflict' ELSE 'updated' END AS outcome,
      ${withMembership ? sql`(SELECT id FROM membership_write)` : sql`NULL::uuid`} AS "membershipId",
      ${withMembership ? sql`(SELECT action FROM membership_write)` : sql`NULL::text`} AS "membershipAction",
      (SELECT count(*) FROM audited) AS audited_count,
      ${metaTouch} AS meta_count
  `))[0]);
  if (!parsed) throw new Error("IMPORT_WRITE_INCOMPLETE");
  return parsed;
}
