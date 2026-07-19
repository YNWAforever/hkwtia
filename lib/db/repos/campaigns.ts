import "server-only";

import {and, eq, sql} from "drizzle-orm";
import {z} from "zod";

import type {CampaignQueueDependencies, CampaignQueueMember, CampaignQueueResult, QueueCampaignInput} from "@/lib/admin/campaigns";
import {segmentFilterSchema, type SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/actor";
import {auditEvents, campaignRecipients, campaigns, companies, companyMembers, emailLog, engagementScores, memberships, profiles, savedSegments} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {AdminActor} from "@/lib/membership/lifecycle";

const savedSegmentRowSchema = z.object({id: z.string().uuid(), ownerProfileId: z.string(), filters: z.record(z.unknown())});
const audienceRowSchema = z.object({profileId: z.string(), displayName: z.string(), email: z.string().nullable(), locale: z.string(), consentMarketing: z.boolean(), suppressed: z.boolean(), renewalAt: z.coerce.date().nullable()});
const campaignRowSchema = z.object({id: z.string().uuid()});
const countRowSchema = z.object({count: z.coerce.number()});

type DbExecutor = Pick<Awaited<ReturnType<typeof getDb>>, "select" | "insert" | "execute">;

function asDb(store: unknown): DbExecutor {
  return store as DbExecutor;
}

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function segmentPredicates(filter: SegmentFilterSet) {
  const terms = [];
  if (filter.tier.length) terms.push(sql`${memberships.planCode} IN (${sql.join(filter.tier.map((tier) => sql`${tier}`), sql`, `)})`);
  if (filter.status.length) terms.push(sql`${memberships.status} IN (${sql.join(filter.status.map((status) => sql`${status}`), sql`, `)})`);
  if (filter.scoreMin !== null) terms.push(sql`${engagementScores.score} >= ${filter.scoreMin}`);
  if (filter.scoreMax !== null) terms.push(sql`${engagementScores.score} <= ${filter.scoreMax}`);
  if (filter.renewalWithinDays !== null) {
    const now = new Date();
    const renewalCutoff = new Date(now.getTime() + filter.renewalWithinDays * 86_400_000);
    terms.push(sql`${memberships.billingPeriodEnd} >= ${now} AND ${memberships.billingPeriodEnd} <= ${renewalCutoff}`);
  }
  if (filter.sector) terms.push(sql`${companies.industry} ILIKE ${`%${filter.sector}%`}`);
  if (filter.lastLoginBeforeDays !== null) {
    const cutoff = new Date(Date.now() - filter.lastLoginBeforeDays * 86_400_000);
    terms.push(sql`${profiles.lastLoginAt} <= ${cutoff}`);
  }
  return terms.length ? and(...terms) : sql`TRUE`;
}

function toQueueMember(row: z.infer<typeof audienceRowSchema>): CampaignQueueMember {
  return {...row, renewalAt: row.renewalAt?.toISOString().slice(0, 10) ?? null};
}

async function campaignAudience(store: unknown, filter: SegmentFilterSet): Promise<readonly CampaignQueueMember[]> {
  const db = asDb(store);
  const predicates = segmentPredicates(filter);
  const rows = await db.execute(sql`
    WITH candidate_rows AS (
      SELECT ${profiles.id} AS profile_id, ${profiles.displayName} AS display_name, ${profiles.email} AS email,
        ${profiles.locale} AS locale, ${profiles.consentMarketing} AS consent_marketing, ${memberships.billingPeriodEnd} AS renewal_at,
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY ${memberships.billingPeriodEnd} ASC NULLS LAST, ${memberships.id} NULLS LAST, ${companies.id} NULLS LAST) AS row_rank
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      LEFT JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
      WHERE ${predicates}
    )
    SELECT profile_id AS "profileId", display_name AS "displayName", email, locale, consent_marketing AS "consentMarketing", renewal_at AS "renewalAt",
      EXISTS(SELECT 1 FROM ${emailLog} WHERE ${emailLog.profileId} = profile_id AND ${emailLog.status} = 'suppressed') AS suppressed
    FROM candidate_rows WHERE row_rank = 1 ORDER BY "profileId"
  `);
  return z.array(audienceRowSchema).parse(resultRows(rows)).map(toQueueMember);
}

export const campaignsRepository: CampaignQueueDependencies = {
  async transaction<T>(callback: (store: unknown) => Promise<T>): Promise<T> {
    const db = await getDb();
    return db.transaction(async (tx) => callback(tx));
  },

  async findCampaignByIdempotencyKey(store, idempotencyKey) {
    const db = asDb(store);
    const campaign = (await db.select({id: campaigns.id}).from(campaigns).where(eq(campaigns.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (!campaign) return null;
    const count = countRowSchema.parse((await db.select({count: sql<number>`count(*)`}).from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaign.id)))[0]).count;
    return {campaignId: campaign.id, recipientCount: count};
  },

  async getSavedSegment(store, actor, segmentId) {
    requireAdmin(actor);
    const db = asDb(store);
    const row = (await db.select({id: savedSegments.id, ownerProfileId: savedSegments.ownerProfileId, filters: savedSegments.filters}).from(savedSegments).where(and(eq(savedSegments.id, segmentId), eq(savedSegments.ownerProfileId, actor.profileId))).limit(1))[0];
    if (!row) return null;
    const parsed = savedSegmentRowSchema.parse(row);
    return {...parsed, filters: segmentFilterSchema.parse(parsed.filters)};
  },

  async membersForSegment(store, filter) {
    return campaignAudience(store, filter);
  },

  async createCampaign(store, actor: AdminActor, input: QueueCampaignInput): Promise<CampaignQueueResult> {
    requireAdmin(actor);
    const db = asDb(store);
    const inserted = await db.insert(campaigns).values({segmentId: input.segmentId, createdByProfileId: actor.profileId, template: input.template, localeStrategy: input.localeStrategy, idempotencyKey: input.idempotencyKey}).onConflictDoNothing({target: campaigns.idempotencyKey}).returning({id: campaigns.id});
    if (inserted[0]) return {campaignId: campaignRowSchema.parse(inserted[0]).id, recipientCount: 0, disposition: "created"};
    const existing = await this.findCampaignByIdempotencyKey(store, input.idempotencyKey);
    if (!existing) throw new Error("Campaign idempotency claim was not visible");
    return {...existing, disposition: "existing"};
  },

  async insertRecipients(store, campaignId, recipients) {
    if (!recipients.length) return;
    const db = asDb(store);
    await db.insert(campaignRecipients).values(recipients.map((recipient) => ({campaignId, ...recipient, variables: recipient.variables as Record<string, string>})));
  },

  async appendAudit(store, actor, campaignId, recipientCount) {
    requireAdmin(actor);
    const db = asDb(store);
    await db.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: "campaign.queued", targetType: "campaign", targetId: campaignId, metadata: {recipientCount}});
  },
};
