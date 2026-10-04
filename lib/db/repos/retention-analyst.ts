import "server-only";

import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { encodeScopedCursor, decodeScopedCursor } from "@/lib/admin/pagination";
import {
  AT_RISK_SCORE_MAX,
  AT_RISK_TREND_MAX,
  AT_RISK_NO_LOGIN_DAYS,
  AT_RISK_RENEWAL_DAYS,
  AT_RISK_DAY_MS,
} from "@/lib/admin/at-risk";
import { z } from "zod";

import {
  projectRetentionCandidates,
  deduplicateRetentionCandidates,
  type RetentionCandidate,
  type RetentionCandidateSource,
} from "@/lib/ai/retention-analyst/candidates";
import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import { getDb } from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  companyMembers,
  engagementScores,
  memberships,
  profiles,
} from "@/lib/db/server-schema";

const listInputSchema = z
  .object({
    asOf: z.date().refine((value) => Number.isFinite(value.getTime())),
  })
  .strict();
const candidateRowSchema = z
  .object({
    profile_id: z.string().min(1),
    membership_id: z.string().min(1),
    locale: z.string().nullable(),
    plan_code: z.string().min(1),
    status: z.enum(["active", "past_due"]),
    renewal_at: z.coerce.date().nullable(),
    score: z.union([z.string(), z.number()]).nullable(),
    trend: z.union([z.string(), z.number()]).nullable(),
    last_login_at: z.coerce.date().nullable(),
  })
  .strict();

export type RetentionCandidatePageItem = RetentionCandidate &
  Readonly<{ pending: boolean; factsHash: string }>;
export type RetentionCandidatePage = Readonly<{
  items: readonly RetentionCandidatePageItem[];
  nextCursor: string | null;
}>;
export type RetentionCandidatePageReader = (
  actor: AutomationRepositoryActor,
  input: Readonly<{ asOf: Date; cursor?: string | null; limit?: number }>,
) => Promise<RetentionCandidatePage>;
export type RetentionAnalystRepository = Readonly<{
  /** Compatibility reader only. Scheduled processing and dry-run count use bounded pages. */
  listCandidates: (
    actor: AutomationRepositoryActor,
    input: Readonly<{ asOf: Date }>,
  ) => Promise<readonly RetentionCandidate[]>;
  listCandidatePage: RetentionCandidatePageReader;
  getCurrentCandidate: (
    actor: AutomationRepositoryActor,
    input: Readonly<{ profileId: string; asOf: Date }>,
  ) => Promise<RetentionCandidatePageItem | null>;
}>;
const pageInputSchema = listInputSchema.extend({
  cursor: z.string().max(1000).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(100),
});
const pageRowSchema = candidateRowSchema.extend({
  pending: z.boolean(),
  consent_hash: z.string(),
});

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  throw Error("RETENTION_SQL_RESULT_INVALID");
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return (await getDb()) as unknown as AutomationDatabase;
}

export function createRetentionAnalystRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
): RetentionAnalystRepository {
  const readPage = async (
    actor: AutomationRepositoryActor,
    input: Parameters<RetentionCandidatePageReader>[1],
    profileId?: string,
  ): Promise<RetentionCandidatePage> => {
    requireAutomationCron(actor);
    const { asOf, cursor, limit } = pageInputSchema.parse(input);
    const scope = "retention-candidates:v1:" + asOf.toISOString();
    const after = cursor ? decodeScopedCursor(scope, cursor) : null;
    const database = await loadDatabase();
    const inactiveBefore = new Date(
      asOf.getTime() - AT_RISK_NO_LOGIN_DAYS * AT_RISK_DAY_MS,
    );
    const renewalBefore = new Date(
      asOf.getTime() + AT_RISK_RENEWAL_DAYS * AT_RISK_DAY_MS,
    );
    // Profile groups own the cursor boundary. Choosing one membership within each
    // group avoids duplicate members when a company seat overlaps direct ownership.
    // LATERAL plus the outer LIMIT bounds transfer and avoids the old unbounded OR join.
    const records = z.array(pageRowSchema).parse(
      resultRows(
        await database.execute(sql`
      SELECT ${profiles.id} AS profile_id,${memberships.id} AS membership_id,
        ${profiles.locale} AS locale,${memberships.planCode} AS plan_code,
        ${memberships.status} AS status,${memberships.billingPeriodEnd} AS renewal_at,
        ${engagementScores.score} AS score,${engagementScores.trend} AS trend,
        ${profiles.lastLoginAt} AS last_login_at,
        EXISTS(SELECT 1 FROM approvals WHERE action_type='agent.retention_outreach'
          AND status='pending' AND payload->>'profileId'=${profiles.id}) AS pending,
        md5(jsonb_build_object('marketing',${profiles.consentMarketing},'whatsapp',${profiles.whatsappOptIn},
          'suppressed',EXISTS(SELECT 1 FROM message_suppressions s WHERE s.profile_id=${profiles.id}),
          'contacts',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.id,c.whatsapp_opt_in,c.whatsapp_opted_out_at) ORDER BY c.id),'[]'::jsonb) FROM contacts c WHERE c.profile_id=${profiles.id}))::text) AS consent_hash
      FROM ${profiles}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId}=${profiles.id}
      INNER JOIN LATERAL (
        SELECT owned.* FROM (
          SELECT m.id,m.plan_code,m.status,m.billing_period_end FROM ${memberships} AS m
          WHERE m.owner_user_id=${profiles.id} AND m.status IN ('active','past_due') AND m.created_at<=${asOf}
          UNION ALL
          SELECT m.id,m.plan_code,m.status,m.billing_period_end FROM ${companyMembers} AS seat
          INNER JOIN ${memberships} AS m ON m.company_id=seat.company_id
          WHERE seat.user_id=${profiles.id} AND seat.revoked_at IS NULL AND seat.joined_at<=${asOf}
            AND m.status IN ('active','past_due') AND m.created_at<=${asOf}
        ) AS owned
        WHERE (${engagementScores.score}<${AT_RISK_SCORE_MAX} AND ${engagementScores.trend}<${AT_RISK_TREND_MAX})
          OR ((${profiles.lastLoginAt} IS NULL OR ${profiles.lastLoginAt}<=${inactiveBefore})
            AND owned.billing_period_end>=${asOf} AND owned.billing_period_end<=${renewalBefore})
        ORDER BY owned.billing_period_end::date NULLS LAST,owned.id
        LIMIT 1
      ) AS memberships ON true
      WHERE ${profiles.createdAt}<=${asOf} ${profileId ? sql`AND ${profiles.id}=${profileId}` : sql``} ${after ? sql`AND ${profiles.id}>${after[0]}` : sql``}
      ORDER BY ${profiles.id},${memberships.id}
      LIMIT ${limit + 1}
    `),
      ),
    );
    if (records.length > limit + 1) throw Error("RETENTION_PAGE_UNBOUNDED");
    const bounded = records.slice(0, limit);
    const sources: RetentionCandidateSource[] = bounded.map((row) => ({
      profileId: row.profile_id,
      membershipId: row.membership_id,
      locale: row.locale,
      planCode: row.plan_code,
      status: row.status,
      renewalAt: row.renewal_at,
      score: row.score === null ? null : Number(row.score),
      trend: row.trend === null ? null : Number(row.trend),
      lastLoginAt: row.last_login_at,
    }));
    const candidates = projectRetentionCandidates(sources, asOf);
    if (candidates.length !== bounded.length)
      throw Error("RETENTION_PAGE_INVALID");
    const candidateByProfile = new Map(
      candidates.map((candidate) => [candidate.profileId, candidate]),
    );
    const items = bounded.map((row) => {
      const candidate = candidateByProfile.get(row.profile_id)!;
      return {
        ...candidate,
        pending: row.pending,
        factsHash: createHash("sha256")
          .update(
            JSON.stringify({
              candidate,
              status: row.status,
              renewalAt: row.renewal_at,
              lastLoginAt: row.last_login_at,
              consentHash: row.consent_hash,
            }),
          )
          .digest("hex"),
      };
    });
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        records.length > limit && last
          ? encodeScopedCursor(scope, [last.profileId, last.membershipId, ""])
          : null,
    };
  };
  return {
    listCandidatePage: (actor, input) => readPage(actor, input),
    async getCurrentCandidate(actor, input) {
      requireAutomationCron(actor);
      const parsed = listInputSchema
        .extend({ profileId: z.string().min(1).max(255) })
        .parse(input);
      return (
        (
          await readPage(
            actor,
            { asOf: parsed.asOf, limit: 1 },
            parsed.profileId,
          )
        ).items[0] ?? null
      );
    },
    async listCandidates(actor, input) {
      requireAutomationCron(actor);
      const parsed = listInputSchema.parse(input);
      const result: RetentionCandidate[] = [];
      let cursor: string | null = null;
      const visited = new Set<string>();
      do {
        const page = await readPage(actor, { ...parsed, cursor, limit: 100 });
        result.push(
          ...page.items.map(({ pending, factsHash, ...candidate }) => {
            void pending;
            void factsHash;
            return candidate;
          }),
        );
        cursor = page.nextCursor;
        if (cursor) {
          if (visited.has(cursor))
            throw Error("RETENTION_CURSOR_NOT_ADVANCING");
          visited.add(cursor);
        }
      } while (cursor);
      return deduplicateRetentionCandidates(result);
    },
  };
}
export const retentionAnalystRepository = createRetentionAnalystRepository();
