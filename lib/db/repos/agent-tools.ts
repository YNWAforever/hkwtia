import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireConciergeAgent,
  type ConciergeAgentActor,
} from "@/lib/auth/agent-actor";
import type {EmbeddingAdapter} from "@/lib/ai/embeddings";
import {approvalsRepository} from "@/lib/db/repos/approvals";
import {getDb, type Database} from "@/lib/db/repos/common";
import {kbDocumentsRepository} from "@/lib/db/repos/kb-documents";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {
  companies,
  companyMembers,
  events,
  memberships,
  profiles,
} from "@/lib/db/server-schema";

export type ConciergeLocale = "en" | "zh-HK";

export type AgentKnowledgeRecord = Readonly<{
  title: string;
  url: string;
  excerpt: string;
  score: number;
}>;

export type AgentMemberContextRecord = Readonly<{
  displayName: string;
  preferredLocale: ConciergeLocale;
  companyDisplayName: string | null;
  membershipTier: string | null;
  membershipStatus: string | null;
  renewalDate: string | null;
}>;

export type AgentEventRecord = Readonly<{
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
}>;

export type AgentDraftApprovalRecord = Readonly<{
  id: string;
  status: "pending";
}>;

export type AgentStaffTaskRecord = Readonly<{
  id: string;
  status: "open";
}>;

export type AgentKnowledgeSearchInput = Readonly<{
  namespace: "m4a-core-v1";
  locale: ConciergeLocale;
  queryEmbedding: readonly number[];
  k: number;
}>;

export type AgentEventListInput = Readonly<{
  locale: ConciergeLocale;
  from: Date;
  to: Date;
  limit: number;
}>;

export type AgentDraftApprovalInput = Readonly<{
  to: string;
  subject: string;
  text: string;
  locale: ConciergeLocale;
  conversationId: string;
  agentRunId: string;
}>;

export type AgentStaffTaskFacadeInput = Readonly<{
  profileId: string | null;
  kind: string;
  summaryCode:
    | "human_requested"
    | "policy_boundary"
    | "low_confidence"
    | "tool_unavailable"
    | "provider_handoff";
  reasonCode: string;
  locale: ConciergeLocale;
  contactEmail?: string;
}>;

export type ConciergeToolRepositories = Readonly<{
  searchKnowledge: (
    actor: ConciergeAgentActor,
    input: AgentKnowledgeSearchInput,
  ) => Promise<readonly AgentKnowledgeRecord[]>;
  getMemberContext: (
    actor: ConciergeAgentActor,
  ) => Promise<AgentMemberContextRecord | null>;
  listEvents: (
    actor: ConciergeAgentActor,
    input: AgentEventListInput,
  ) => Promise<readonly AgentEventRecord[]>;
  createDraftEmailApproval: (
    actor: ConciergeAgentActor,
    input: AgentDraftApprovalInput,
  ) => Promise<AgentDraftApprovalRecord>;
  createStaffTask: (
    actor: ConciergeAgentActor,
    input: AgentStaffTaskFacadeInput,
  ) => Promise<AgentStaffTaskRecord>;
}>;

const localeSchema = z.enum(["en", "zh-HK"]);
const knowledgeInputSchema = z.object({
  namespace: z.literal("m4a-core-v1"),
  locale: localeSchema,
  queryEmbedding: z.array(z.number().finite()).length(1536),
  k: z.number().int().min(1).max(10),
}).strict();
const eventInputSchema = z.object({
  locale: localeSchema,
  from: z.date().refine((value) => Number.isFinite(value.getTime())),
  to: z.date().refine((value) => Number.isFinite(value.getTime())),
  limit: z.number().int().min(1).max(25),
}).strict().refine(({from, to}) => from < to, {
  message: "EVENT_RANGE_INVALID",
});
const staffTaskInputSchema = z.object({
  profileId: z.string().min(1).max(255).nullable(),
  kind: z.enum([
    "concierge_member_follow_up",
    "concierge_event_follow_up",
    "concierge_funding_follow_up",
    "concierge_general_follow_up",
    "concierge_escalation",
  ]),
  summaryCode: z.enum([
    "human_requested",
    "policy_boundary",
    "low_confidence",
    "tool_unavailable",
    "provider_handoff",
  ]),
  reasonCode: z.enum([
    "human_requested",
    "policy_boundary",
    "low_confidence",
    "tool_unavailable",
    "provider_handoff",
  ]),
  locale: localeSchema,
  contactEmail: z.string().email().max(320).optional(),
}).strict();
const memberRowSchema = z.object({
  display_name: z.string(),
  preferred_locale: localeSchema,
  company_display_name: z.string().nullable(),
  membership_tier: z.string().nullable(),
  membership_status: z.string().nullable(),
  renewal_date: z.coerce.date().nullable(),
});
const eventRowSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),
  title: z.string().min(1).max(200),
  description: z.string().max(2_000),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date().nullable(),
  venue: z.string().max(500).nullable(),
});

function rowsFrom(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  return [];
}

type RepositoryDependencies = Readonly<{
  loadDatabase?: () => Promise<Database>;
  knowledge?: Pick<typeof kbDocumentsRepository, "search">;
  approvals?: Pick<typeof approvalsRepository, "createDraftEmail">;
  staffTasks?: Pick<typeof staffTasksRepository, "createOnce">;
}>;

export function createAgentToolsRepository(
  dependencies: RepositoryDependencies = {},
): ConciergeToolRepositories {
  const loadDatabase = dependencies.loadDatabase ?? getDb;
  const knowledge = dependencies.knowledge ?? kbDocumentsRepository;
  const approvals = dependencies.approvals ?? approvalsRepository;
  const staffTasks = dependencies.staffTasks ?? staffTasksRepository;

  return Object.freeze({
    async searchKnowledge(actor, input) {
      requireConciergeAgent(actor);
      const parsed = knowledgeInputSchema.parse(input);
      return knowledge.search(parsed);
    },

    async getMemberContext(actor) {
      requireConciergeAgent(actor);
      if (actor.profileId === null) {
        throw new Error("AGENT_MEMBER_CONTEXT_DENIED");
      }
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          ${profiles.displayName} AS display_name,
          ${profiles.locale} AS preferred_locale,
          member_context.company_display_name,
          member_context.membership_tier,
          member_context.membership_status,
          member_context.renewal_date
        FROM ${profiles}
        LEFT JOIN LATERAL (
          SELECT
            ${companies.displayName} AS company_display_name,
            ${memberships.planCode}::text AS membership_tier,
            ${memberships.status}::text AS membership_status,
            ${memberships.billingPeriodEnd} AS renewal_date
          FROM ${memberships}
          LEFT JOIN ${companyMembers}
            ON ${companyMembers.companyId} = ${memberships.companyId}
            AND ${companyMembers.userId} = ${profiles.id}
            AND ${companyMembers.revokedAt} IS NULL
          LEFT JOIN ${companies}
            ON ${companies.id} = ${memberships.companyId}
          WHERE
            ${memberships.ownerUserId} = ${profiles.id}
            OR (
              ${memberships.companyId} = ${companyMembers.companyId}
              AND ${companyMembers.userId} = ${profiles.id}
            )
          ORDER BY
            CASE ${memberships.status}
              WHEN 'active' THEN 0
              WHEN 'past_due' THEN 1
              WHEN 'cancel_at_period_end' THEN 2
              ELSE 3
            END,
            ${memberships.billingPeriodEnd} DESC NULLS LAST,
            ${memberships.id}
          LIMIT 1
        ) AS member_context ON TRUE
        WHERE ${profiles.id} = ${actor.profileId}
        LIMIT 1
      `);
      const row = rowsFrom(result)[0];
      if (!row) return null;
      const parsed = memberRowSchema.parse(row);
      return Object.freeze({
        displayName: parsed.display_name,
        preferredLocale: parsed.preferred_locale,
        companyDisplayName: parsed.company_display_name,
        membershipTier: parsed.membership_tier,
        membershipStatus: parsed.membership_status,
        renewalDate: parsed.renewal_date?.toISOString() ?? null,
      });
    },

    async listEvents(actor, input) {
      requireConciergeAgent(actor);
      const parsed = eventInputSchema.parse(input);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          ${events.slug} AS slug,
          CASE
            WHEN ${parsed.locale} = 'zh-HK'
              THEN COALESCE(${events.titleZh}, ${events.titleEn})
            ELSE ${events.titleEn}
          END AS title,
          left(
            CASE
              WHEN ${parsed.locale} = 'zh-HK'
                THEN COALESCE(${events.descriptionZh}, ${events.descriptionEn})
              ELSE ${events.descriptionEn}
            END,
            2000
          ) AS description,
          ${events.startsAt} AS starts_at,
          ${events.endsAt} AS ends_at,
          ${events.venue} AS venue
        FROM ${events}
        WHERE ${events.published} = true
          AND ${events.startsAt} >= ${parsed.from}
          AND ${events.startsAt} < ${parsed.to}
          AND (
            ${events.memberOnly} = false
            OR (
              -- Cast required: this is a bind parameter, not a column, and
              -- $n IS NOT NULL gives Postgres nothing to infer from — the
              -- whole statement fails with 42P18 without it.
              ${actor.profileId}::text IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM ${memberships}
                LEFT JOIN ${companyMembers}
                  ON ${companyMembers.companyId} = ${memberships.companyId}
                  AND ${companyMembers.userId} = ${actor.profileId}
                  AND ${companyMembers.revokedAt} IS NULL
                WHERE (
                  ${memberships.ownerUserId} = ${actor.profileId}
                  OR (
                    ${memberships.companyId} = ${companyMembers.companyId}
                    AND ${companyMembers.userId} = ${actor.profileId}
                  )
                )
                  AND ${memberships.status} IN (
                    'active',
                    'past_due',
                    'cancel_at_period_end'
                  )
              )
            )
          )        ORDER BY ${events.startsAt}, ${events.slug}, ${events.id}
        LIMIT ${parsed.limit}
      `);
      return Object.freeze(
        z.array(eventRowSchema).max(parsed.limit).parse(rowsFrom(result))
          .map((row) => Object.freeze({
            slug: row.slug,
            title: row.title,
            description: row.description,
            startsAt: row.starts_at.toISOString(),
            endsAt: row.ends_at?.toISOString() ?? null,
            venue: row.venue,
          })),
      );
    },

    async createDraftEmailApproval(actor, input) {
      requireConciergeAgent(actor);
      const created = await approvals.createDraftEmail(actor, input);
      return Object.freeze({id: created.id, status: "pending" as const});
    },

    async createStaffTask(actor, input) {
      requireConciergeAgent(actor);
      const parsed = staffTaskInputSchema.parse(input);
      if (parsed.profileId !== actor.profileId) {
        throw new Error("INVALID_AGENT_STAFF_TASK_PROFILE");
      }
      const result = await staffTasks.createOnce(actor, {
        profileId: parsed.profileId,
        journeyStateId: null,
        kind: parsed.kind,
        dedupeKey:
          `agent-run:${actor.runId}:${parsed.kind}:${parsed.summaryCode}`,
        summaryCode: parsed.summaryCode,
        context: {
          conversationId: actor.conversationId,
          agentRunId: actor.runId,
          reasonCode: parsed.reasonCode,
          locale: parsed.locale,
          ...(parsed.contactEmail === undefined
            ? {}
            : {contactEmail: parsed.contactEmail}),
        },
      });
      return Object.freeze({id: result.record.id, status: "open" as const});
    },
  });
}

export const agentToolsRepository = createAgentToolsRepository();

export type ConciergeEmbeddingAdapter = Pick<EmbeddingAdapter, "embed">;
