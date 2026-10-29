import "server-only";
import {createOwnedApplicationsRepository} from "@/lib/db/repos/owned-applications";

import { randomUUID, createHash } from "node:crypto";
import { deriveApplicationTriage } from "@/lib/ai/application-triage";
import type { ApplicationTriageSnapshot } from "@/lib/admin/application-triage-types";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import {
  applicationCaseContextSchema,
  applicationCasePatchSchema,
  type ApplicationCase,
  type ApplicationCasePatch,
} from "@/lib/admin/application-case-types";
import type { Database } from "@/lib/db/repos/common";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { Actor } from "@/lib/membership/lifecycle";
import {
  companyMembers,
  membershipApplications as membershipApplicationsTable,
  type MembershipApplication,
} from "@/lib/db/server-schema";
import { forbidden, getDb, requireMember } from "@/lib/db/repos/common";

export type ApplicationInput = Pick<MembershipApplication, "planCode"> &
  Partial<Pick<MembershipApplication, "companyId" | "currentStep" | "status">>;
export type ApplicationUpdate = Partial<
  Pick<MembershipApplication, "planCode" | "currentStep" | "status">
>;

// `EXISTS (…)` written out rather than built with Drizzle's `exists()`, which
// pastes a raw `sql` fragment in without parentheses and so emits the syntax
// error `EXISTS SELECT …`. See the note in `lib/db/repos/companies.ts`.
function companyMembershipScope(actor: Extract<Actor, { kind: "member" }>) {
  return sql`EXISTS (SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipApplicationsTable.companyId} AND ${companyMembers.userId} = ${actor.profileId} AND ${companyMembers.revokedAt} IS NULL)`;
}

function companyAccessScope(
  actor: Extract<Actor, { kind: "member" }>,
  companyId: string,
) {
  return sql`EXISTS (SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companyId} AND ${companyMembers.userId} = ${actor.profileId} AND ${companyMembers.revokedAt} IS NULL)`;
}
function applicationScope(actor: Actor, applicationId: string) {
  if (actor.kind === "system")
    return and(eq(membershipApplicationsTable.id, applicationId), sql`true`);
  if (actor.kind !== "member") return sql`false`;
  return and(
    eq(membershipApplicationsTable.id, applicationId),
    or(
      eq(membershipApplicationsTable.applicantUserId, actor.profileId),
      companyMembershipScope(actor),
    ),
  );
}

const applicationCases = createApplicationCasesRepository();

export const applicationsRepository = {
  ...createOwnedApplicationsRepository(),
  getApplicationCase: applicationCases.getApplicationCase,
  getApplicationTriage: applicationCases.getApplicationTriage,
  updateApplicationCase: applicationCases.updateApplicationCase,
  getApplicationCaseSaveResult: applicationCases.getApplicationCaseSaveResult,
  /** Applicant-owned applications only; company access never grants join-resume authority. */
  async listOwned(
    actor: Actor,
    planCode?: MembershipApplication["planCode"],
  ): Promise<MembershipApplication[]> {
    requireMember(actor);
    const db = await getDb();
    return db
      .select()
      .from(membershipApplicationsTable)
      .where(
        and(
          eq(membershipApplicationsTable.applicantUserId, actor.profileId),
          planCode
            ? eq(membershipApplicationsTable.planCode, planCode)
            : sql`true`,
        ),
      )
      .orderBy(
        desc(membershipApplicationsTable.updatedAt),
        desc(membershipApplicationsTable.id),
      );
  },
  /** The advisory lock serializes find/create for an applicant, plan and ownership target. */
  async resumeOrCreate(
    actor: Actor,
    input: {
      planCode: MembershipApplication["planCode"];
      companyId: string | null;
      newApplication: boolean;
    },
  ): Promise<MembershipApplication> {
    requireMember(actor);
    const db = await getDb();
    return db.transaction(async (tx) => {
      const scope = `${actor.profileId}:${input.planCode}:${input.companyId ?? "unassigned"}`;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`,
      );
      if (input.companyId) {
        const member = await tx
          .select({ userId: companyMembers.userId })
          .from(companyMembers)
          .where(
            and(
              eq(companyMembers.companyId, input.companyId),
              eq(companyMembers.userId, actor.profileId),
              isNull(companyMembers.revokedAt),
            ),
          )
          .limit(1);
        if (!member[0]) forbidden();
      }
      if (!input.newApplication) {
        const existing = await tx
          .select()
          .from(membershipApplicationsTable)
          .where(
            and(
              eq(membershipApplicationsTable.applicantUserId, actor.profileId),
              eq(membershipApplicationsTable.planCode, input.planCode),
              input.companyId
                ? eq(membershipApplicationsTable.companyId, input.companyId)
                : isNull(membershipApplicationsTable.companyId),
              inArray(membershipApplicationsTable.status, [
                "draft",
                "pending_payment",
                "pending_review",
              ]),
            ),
          )
          .orderBy(
            desc(membershipApplicationsTable.updatedAt),
            desc(membershipApplicationsTable.id),
          )
          .limit(1);
        if (existing[0]) return existing[0];
      }
      const created = await tx
        .insert(membershipApplicationsTable)
        .values({
          applicantUserId: actor.profileId,
          planCode: input.planCode,
          companyId: input.companyId,
          currentStep: "profile",
          status: "draft",
        })
        .returning();
      return created[0];
    });
  },
  async setCompany(
    actor: Actor,
    applicationId: string,
    companyId: string,
  ): Promise<MembershipApplication | null> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db
      .update(membershipApplicationsTable)
      .set({ companyId, updatedAt: new Date() })
      .where(
        and(
          eq(membershipApplicationsTable.id, applicationId),
          eq(membershipApplicationsTable.applicantUserId, actor.profileId),
          companyAccessScope(actor, companyId),
        ),
      )
      .returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },
  async getById(
    actor: Actor,
    applicationId: string,
  ): Promise<MembershipApplication | null> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db
      .select()
      .from(membershipApplicationsTable)
      .where(applicationScope(actor, applicationId))
      .limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async list(actor: Actor): Promise<MembershipApplication[]> {
    if (actor.kind === "anonymous") return [];
    const db = await getDb();
    if (actor.kind === "system")
      return db.select().from(membershipApplicationsTable);
    if (actor.kind !== "member") return [];
    return db
      .select()
      .from(membershipApplicationsTable)
      .where(
        or(
          eq(membershipApplicationsTable.applicantUserId, actor.profileId),
          companyMembershipScope(actor),
        ),
      );
  },

  async create(
    actor: Actor,
    input: ApplicationInput,
  ): Promise<MembershipApplication> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db
      .insert(membershipApplicationsTable)
      .values({ ...input, applicantUserId: actor.profileId })
      .returning();
    return rows[0];
  },

  async update(
    actor: Actor,
    applicationId: string,
    input: ApplicationUpdate,
  ): Promise<MembershipApplication | null> {
    requireMember(actor);
    if (Object.prototype.hasOwnProperty.call(input, "companyId")) forbidden();
    const db = await getDb();
    const rows = await db
      .update(membershipApplicationsTable)
      .set({
        ...input,
        // A browser save prepared before payment can arrive after activation.
        // Preserve completion using the committed row inside this UPDATE.
        ...(input.status !== undefined ? {
          status: sql`CASE WHEN ${membershipApplicationsTable.status} = 'completed'
            THEN ${membershipApplicationsTable.status} ELSE ${input.status} END`,
        } : {}),
        ...(input.currentStep !== undefined ? {
          currentStep: sql`CASE WHEN ${membershipApplicationsTable.status} = 'completed'
            THEN ${membershipApplicationsTable.currentStep} ELSE ${input.currentStep} END`,
        } : {}),
        updatedAt: new Date(),
      })
      .where(applicationScope(actor, applicationId))
      .returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, applicationId: string): Promise<void> {
    requireMember(actor);
    const db = await getDb();
    await db
      .delete(membershipApplicationsTable)
      .where(applicationScope(actor, applicationId));
  },
};

export const applicationsRepo = applicationsRepository;

export const applications = applicationsRepository;

/** Operational metadata stays in the existing uniquely-deduplicated staff task.
 * No case operation changes an applicant, company owner, payment or entitlement.
 */
export function createApplicationCasesRepository(
  load: () => Promise<Database> = getDb,
) {
  async function getApplicationTriage(
    actor: Actor,
    id: string,
  ): Promise<ApplicationTriageSnapshot | null> {
    requireAdmin(actor);
    const db = await load();
    return db.transaction((tx) => readApplicationTriageSource(actor, id, tx));
  }
  async function getApplicationCase(
    actor: Actor,
    id: string,
  ): Promise<ApplicationCase | null> {
    requireAdmin(actor);
    const applicationId = z.string().uuid().parse(id);
    const db = await load();
    const result = await db.execute(sql`
      SELECT app.id, app.applicant_user_id, p.display_name, p.email, p.phone,
        p.job_title, p.locale, p.onboarding_state, app.company_id,
        c.display_name AS company_name, c.legal_name AS company_legal_name,
        c.website AS company_website, c.industry AS company_industry,
        c.size_band AS company_size_band, c.description AS company_description,
        app.plan_code, app.status, app.current_step, app.created_at, app.updated_at,
        m.id AS membership_id, m.status AS membership_status,
        attempt.id AS attempt_id, attempt.state AS attempt_state, task.context
      FROM membership_applications app JOIN profiles p ON p.id=app.applicant_user_id
      LEFT JOIN companies c ON c.id=app.company_id
      LEFT JOIN memberships m ON m.application_id=app.id
      LEFT JOIN LATERAL (SELECT id,state FROM billing_attempts WHERE membership_id=m.id ORDER BY attempt_number DESC,id DESC LIMIT 1) attempt ON TRUE
      LEFT JOIN staff_tasks task ON task.dedupe_key='membership-application:'||app.id::text AND task.kind='membership_application'
      WHERE app.id=${applicationId} LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    const context = row.context
      ? applicationCaseContextSchema.parse(row.context)
      : null;
    if (context && context.applicationId !== applicationId)
      throw Error("APPLICATION_CASE_CONTEXT_INVALID");
    const audits =
      await db.execute(sql`SELECT audit.id,audit.created_at,audit.actor_type,audit.actor_user_id,
        actor.display_name AS actor_name,audit.metadata
      FROM audit_events audit LEFT JOIN profiles actor ON actor.id=audit.actor_user_id
      WHERE audit.target_type='membership_application' AND audit.target_id=${applicationId}
        AND audit.action='membership.application.case.updated'
      ORDER BY audit.created_at DESC,audit.id DESC LIMIT 50`);
    return {
      profile: {
        email: row.email === null ? null : String(row.email),
        phone: row.phone === null ? null : String(row.phone),
        jobTitle: row.job_title === null ? null : String(row.job_title),
        locale: String(row.locale),
        onboardingState: String(row.onboarding_state),
      },
      company:
        row.company_id === null
          ? null
          : {
              id: String(row.company_id),
              legalName: String(row.company_legal_name),
              displayName: String(row.company_name),
              website:
                row.company_website === null
                  ? null
                  : String(row.company_website),
              industry:
                row.company_industry === null
                  ? null
                  : String(row.company_industry),
              sizeBand:
                row.company_size_band === null
                  ? null
                  : String(row.company_size_band),
              description:
                row.company_description === null
                  ? null
                  : String(row.company_description),
            },
      application: {
        id: applicationId,
        profileId: String(row.applicant_user_id),
        name: String(row.display_name),
        companyId: row.company_id === null ? null : String(row.company_id),
        companyName:
          row.company_name === null ? null : String(row.company_name),
        planCode: String(row.plan_code),
        status: String(row.status),
        step: String(row.current_step),
        createdAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
      },
      membership: row.membership_id
        ? {
            id: String(row.membership_id),
            status: String(row.membership_status),
          }
        : null,
      payment: row.attempt_id
        ? {
            attemptId: String(row.attempt_id),
            state: String(row.attempt_state),
          }
        : null,
      version: context?.caseVersion ?? "0",
      ownerProfileId: context?.ownerProfileId ?? null,
      dueAt: context?.dueAt ?? null,
      missingFields: context?.missingFields ?? [],
      nextActionCode: context?.nextActionCode ?? "none",
      timeline: audits.rows.map((audit) => {
        const metadata = z
          .object({
            case: applicationCaseContextSchema,
            note: z.string().nullable(),
          })
          .parse(audit.metadata);
        return {
          id: String(audit.id),
          at: new Date(String(audit.created_at)).toISOString(),
          actorType: String(audit.actor_type),
          actorUserId:
            audit.actor_user_id === null ? null : String(audit.actor_user_id),
          actorName:
            audit.actor_name === null ? null : String(audit.actor_name),
          note: metadata.note,
          case: metadata.case,
        };
      }),
    };
  }
  async function updateApplicationCase(
    actor: Actor,
    id: string,
    patch: ApplicationCasePatch,
  ): Promise<{ version: string }> {
    requireAdmin(actor);
    const db = await load();
    return db.transaction((tx) =>
      updateApplicationCaseInTransaction(actor, id, patch, tx),
    );
  }
  async function getApplicationCaseSaveResult(actor: Actor, id: string, requestId: string) {
    requireAdmin(actor);
    const db = await load();
    const receipt = await readCaseSaveReceipt(actor, z.string().uuid().parse(id), z.string().uuid().parse(requestId), db);
    return receipt ? { version: receipt.version } : null;
  }
  return { getApplicationCase, updateApplicationCase, getApplicationTriage, getApplicationCaseSaveResult };
}

export type ApplicationFactsExecutor = Readonly<{
  execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown>;
}>;
function applicationFactRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows as Record<string, unknown>[];
  throw Error("APPLICATION_FACT_SQL_RESULT_INVALID");
}
async function readCaseSaveReceipt(actor: Actor, id: string, requestId: string, tx: ApplicationFactsExecutor) {
  requireAdmin(actor);
  const row = applicationFactRows(await tx.execute(sql`
    SELECT metadata FROM audit_events
    WHERE target_type='membership_application' AND target_id=${id}
      AND action='membership.application.case.updated' AND actor_user_id=${actor.profileId}
      AND metadata->>'requestId'=${requestId}
    LIMIT 1
  `))[0];
  if (!row) return null;
  const receipt = z.object({
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    case: applicationCaseContextSchema,
  }).parse(row.metadata);
  if (receipt.case.applicationId !== id) throw Error("APPLICATION_CASE_CONTEXT_INVALID");
  return { version: receipt.case.caseVersion, hash: receipt.requestHash };
}

function caseRequestHash(patch: ApplicationCasePatch) {
  return createHash("sha256").update(JSON.stringify({
    expectedVersion: patch.expectedVersion,
    ownerProfileId: patch.ownerProfileId,
    dueAt: patch.dueAt,
    missingFields: patch.missingFields?.slice().sort(),
    nextActionCode: patch.nextActionCode,
    note: patch.note,
  })).digest("hex");
}
/** Reads the same application case in its caller's transaction. Only minimal states, field decisions and hashes leave this boundary. */
export async function readApplicationTriageSource(
  actor: Actor,
  id: string,
  tx: ApplicationFactsExecutor,
): Promise<ApplicationTriageSnapshot | null> {
  requireAdmin(actor);
  const applicationId = z.string().uuid().parse(id);
  const current = applicationFactRows(
    await tx.execute(
      sql`SELECT id FROM profiles WHERE id=${actor.profileId} AND auth_user_id=${actor.userId} AND role=${actor.kind} FOR SHARE`,
    ),
  )[0];
  if (!current) forbidden();
  // An exclusive application lock also fences concurrent first membership/task insertion; the existing case writer locks this same row first.
  const app = applicationFactRows(
    await tx.execute(
      sql`SELECT id,applicant_user_id,company_id,plan_code,status,current_step,updated_at FROM membership_applications WHERE id=${applicationId} FOR UPDATE`,
    ),
  )[0];
  if (!app) return null;
  const p = applicationFactRows(
    await tx.execute(
      sql`SELECT display_name,phone,job_title,locale,whatsapp_number,whatsapp_opt_in,updated_at FROM profiles WHERE id=${app.applicant_user_id} FOR SHARE`,
    ),
  )[0];
  if (!p) throw Error("APPLICATION_FACT_PROFILE_UNAVAILABLE");
  const c = app.company_id
    ? applicationFactRows(
        await tx.execute(
          sql`SELECT legal_name,display_name,website,industry,size_band,description,updated_at FROM companies WHERE id=${app.company_id} FOR SHARE`,
        ),
      )[0]
    : undefined;
  if (app.company_id && !c) throw Error("APPLICATION_FACT_COMPANY_UNAVAILABLE");
  const m = applicationFactRows(
    await tx.execute(
      sql`SELECT id,status,stripe_subscription_id,updated_at FROM memberships WHERE application_id=${applicationId} ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE`,
    ),
  )[0];
  const attempt = m
    ? applicationFactRows(
        await tx.execute(
          sql`SELECT id,state,updated_at FROM billing_attempts WHERE membership_id=${m.id} ORDER BY attempt_number DESC,id DESC LIMIT 1 FOR SHARE`,
        ),
      )[0]
    : undefined;
  const task = applicationFactRows(
    await tx.execute(
      sql`SELECT kind,context,updated_at FROM staff_tasks WHERE dedupe_key=${"membership-application:" + applicationId} FOR SHARE`,
    ),
  )[0];
  if (task && task.kind !== "membership_application")
    throw Error("APPLICATION_CASE_CONTEXT_INVALID");
  const context = task
    ? applicationCaseContextSchema.parse(task.context)
    : null;
  if (context && context.applicationId !== applicationId)
    throw Error("APPLICATION_CASE_CONTEXT_INVALID");
  const optional = (v: unknown) => (v == null ? null : String(v)),
    locale = z.enum(["en", "zh-HK"]).parse(p.locale);
  const triage = deriveApplicationTriage({
    planCode: String(app.plan_code),
    status: String(app.status),
    profile: {
      displayName: String(p.display_name),
      phone: optional(p.phone),
      jobTitle: optional(p.job_title),
      locale,
      whatsappNumber: optional(p.whatsapp_number),
      whatsappOptIn: p.whatsapp_opt_in === true,
    },
    company: c
      ? {
          legalName: String(c.legal_name),
          displayName: String(c.display_name),
          website: optional(c.website),
          industry: optional(c.industry),
          sizeBand: optional(c.size_band),
          description: optional(c.description),
        }
      : null,
    membership: m
      ? {
          status: String(m.status),
          stripeSubscriptionId: optional(m.stripe_subscription_id),
        }
      : null,
    payment: attempt ? { state: String(attempt.state) } : null,
  });
  return {
    applicationId,
    locale,
    caseVersion: context?.caseVersion ?? "0",
    ownerId: context?.ownerProfileId ?? null,
    dueAt: context?.dueAt ?? null,
    triage,
    states: {
      application: String(app.status),
      membership: m ? String(m.status) : null,
      payment: attempt ? String(attempt.state) : null,
    },
    factsHash: createHash("sha256")
      .update(
        JSON.stringify({
          ruleVersion: "join-schema-v1",
          app,
          profile: p,
          company: c ?? null,
          membership: m ?? null,
          attempt: attempt ?? null,
          case: task ?? null,
        }),
      )
      .digest("hex"),
  };
}

/** Reuse the case CAS and audit write in the adopter's already fenced transaction. */
export async function updateApplicationCaseInTransaction(
  actor: Actor,
  id: string,
  patch: ApplicationCasePatch,
  tx: ApplicationFactsExecutor,
): Promise<{ version: string }> {
  requireAdmin(actor);
  const applicationId = z.string().uuid().parse(id),
    parsed = applicationCasePatchSchema.parse(patch);
  // Lock the existing application first. Simultaneous first assignment and
  // ordinary onboarding updates cannot create two case tasks or lose data.
  const app = applicationFactRows(
    await tx.execute(
      sql`SELECT applicant_user_id FROM membership_applications WHERE id=${applicationId} FOR UPDATE`,
    ),
  )[0];
  if (!app) throw Error("APPLICATION_NOT_FOUND");
  // Serialize receipts under the same application lock as the case CAS.
  // An exact replay acknowledges its original commit; another tab still uses CAS.
  const requestHash = parsed.requestId ? caseRequestHash(parsed) : undefined;
  if (parsed.requestId) {
    const receipt = await readCaseSaveReceipt(actor, applicationId, parsed.requestId, tx);
    if (receipt) {
      if (receipt.hash !== requestHash) throw Error("APPLICATION_CASE_REQUEST_MISMATCH");
      return { version: receipt.version };
    }
  }
  const key = "membership-application:" + applicationId;
  const task = applicationFactRows(
    await tx.execute(
      sql`SELECT id,kind,context FROM staff_tasks WHERE dedupe_key=${key} FOR UPDATE`,
    ),
  )[0];
  if (task && task.kind !== "membership_application")
    throw Error("APPLICATION_CASE_CONTEXT_INVALID");
  const previous = task
    ? applicationCaseContextSchema.parse(task.context)
    : null;
  if (previous && previous.applicationId !== applicationId)
    throw Error("APPLICATION_CASE_CONTEXT_INVALID");
  if (parsed.expectedVersion !== (previous?.caseVersion ?? "0"))
    throw Error("APPLICATION_CASE_VERSION_CONFLICT");
  const owner =
    parsed.ownerProfileId === undefined
      ? (previous?.ownerProfileId ?? null)
      : parsed.ownerProfileId;
  if (owner) {
    const assigned = applicationFactRows(
      await tx.execute(
        sql`SELECT id FROM profiles WHERE id=${owner} AND role IN ('staff','exco','superadmin') FOR SHARE`,
      ),
    )[0];
    if (!assigned) throw Error("APPLICATION_CASE_OWNER_INVALID");
  }
  const context = applicationCaseContextSchema.parse({
    applicationId,
    caseVersion: randomUUID(),
    ownerProfileId: owner,
    dueAt:
      parsed.dueAt === undefined ? (previous?.dueAt ?? null) : parsed.dueAt,
    missingFields: parsed.missingFields ?? previous?.missingFields ?? [],
    nextActionCode: parsed.nextActionCode ?? previous?.nextActionCode ?? "none",
  });
  const encoded = JSON.stringify(context);
  if (new TextEncoder().encode(encoded).byteLength > 4096)
    throw Error("STAFF_TASK_CONTEXT_TOO_LARGE");
  if (task)
    await tx.execute(
      sql`UPDATE staff_tasks SET context=${encoded}::jsonb,summary_code=${context.nextActionCode},status=CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN 'resolved'::staff_task_status ELSE 'open'::staff_task_status END,resolved_at=CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN now() ELSE NULL END,resolved_by_profile_id=CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN ${actor.profileId} ELSE NULL END,updated_at=now() WHERE id=${task.id}`,
    );
  else
    await tx.execute(
      sql`INSERT INTO staff_tasks(profile_id,kind,dedupe_key,summary_code,context,status,resolved_at,resolved_by_profile_id) VALUES(${app.applicant_user_id},'membership_application',${key},${context.nextActionCode},${encoded}::jsonb,CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN 'resolved'::staff_task_status ELSE 'open'::staff_task_status END,CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN now() ELSE NULL END,CASE WHEN ${context.nextActionCode}='follow_up_complete' THEN ${actor.profileId} ELSE NULL END)`,
    );
  await tx.execute(sql`INSERT INTO audit_events(actor_type,actor_user_id,action,target_type,target_id,metadata)
        VALUES(${actor.kind},${actor.profileId},'membership.application.case.updated','membership_application',${applicationId},${JSON.stringify({ previousVersion: parsed.expectedVersion, case: context, note: parsed.note ?? null, ...(parsed.requestId ? { requestId: parsed.requestId, requestHash } : {}) })}::jsonb)`);
  return { version: context.caseVersion };
}
