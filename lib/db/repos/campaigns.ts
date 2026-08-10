import "server-only";

import {and, eq, sql} from "drizzle-orm";
import {z} from "zod";

import {queueCampaignSchema, type CampaignQueueDependencies, type CampaignQueueMember, type CampaignQueueResult, type QueueCampaignInput} from "@/lib/admin/campaigns";
import {segmentFilterSchema, segmentIdSchema, type SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, campaignRecipients, campaigns, companies, companyMembers, emailLog, engagementScores, memberships, profiles, savedSegments} from "@/lib/db/server-schema";
import {
  createCampaignRecipientDeliveryRepository,
  type CampaignRecipientDeliveryRepository,
} from "@/lib/db/repos/campaign-recipient-delivery";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import {segmentPredicates} from "@/lib/db/repos/segments";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const savedSegmentRowSchema = z.object({id: z.string().uuid(), ownerProfileId: z.string(), filters: z.record(z.unknown())});
const audienceRowSchema = z.object({profileId: z.string(), displayName: z.string(), email: z.string().nullable(), locale: z.string(), consentMarketing: z.boolean(), suppressed: z.boolean(), renewalAt: z.coerce.date().nullable()});
const campaignRowSchema = z.object({id: z.string().uuid()});
const countRowSchema = z.object({count: z.coerce.number()});
const idempotencyKeySchema = z.string().uuid();
const campaignIdSchema = z.string().uuid();
const recipientCountSchema = z.number().int().nonnegative();
const campaignRecipientSchema = z.object({
  profileId: z.string().min(1),
  email: z.string().trim().email(),
  locale: z.string().min(1).max(10),
  variables: z.record(z.string()),
}).strict();

type DbExecutor = Pick<Awaited<ReturnType<typeof getDb>>, "select" | "insert" | "execute">;

function asDb(store: unknown): DbExecutor {
  return store as DbExecutor;
}

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function toQueueMember(row: z.infer<typeof audienceRowSchema>): CampaignQueueMember {
  return {...row, renewalAt: row.renewalAt?.toISOString().slice(0, 10) ?? null};
}

async function savedSegmentForActor(actor: AdminActor, store: unknown, segmentId: string) {
  const parsedSegmentId = segmentIdSchema.parse(segmentId);
  const db = asDb(store);
  const row = (await db.select({id: savedSegments.id, ownerProfileId: savedSegments.ownerProfileId, filters: savedSegments.filters})
    .from(savedSegments)
    .where(and(eq(savedSegments.id, parsedSegmentId), eq(savedSegments.ownerProfileId, actor.profileId)))
    .limit(1))[0];
  if (!row) return null;
  const parsed = savedSegmentRowSchema.parse(row);
  return {...parsed, filters: segmentFilterSchema.parse(parsed.filters)};
}

async function ownedCampaign(actor: AdminActor, store: unknown, campaignId: string): Promise<string> {
  const parsedCampaignId = campaignIdSchema.parse(campaignId);
  const db = asDb(store);
  const row = (await db.select({id: campaigns.id})
    .from(campaigns)
    .where(and(eq(campaigns.id, parsedCampaignId), eq(campaigns.createdByProfileId, actor.profileId)))
    .limit(1))[0];
  if (!row) throw new Error("Campaign is not accessible");
  return campaignRowSchema.parse(row).id;
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
    SELECT candidate.profile_id AS "profileId", candidate.display_name AS "displayName", candidate.email, candidate.locale,
      candidate.consent_marketing AS "consentMarketing", candidate.renewal_at AS "renewalAt",
      EXISTS(SELECT 1 FROM ${emailLog} WHERE ${emailLog.profileId} = candidate.profile_id AND ${emailLog.status} = 'suppressed') AS suppressed
    FROM candidate_rows AS candidate WHERE candidate.row_rank = 1 ORDER BY "profileId"
  `);
  return z.array(audienceRowSchema).parse(resultRows(rows)).map(toQueueMember);
}

export type CampaignDbProvider = () => Promise<Awaited<ReturnType<typeof getDb>>>;
export type CampaignsRepository =
  & CampaignQueueDependencies
  & CampaignRecipientDeliveryRepository;

export function createCampaignsRepository(
  getDatabase: CampaignDbProvider,
): CampaignsRepository {
  const recipientDelivery = createCampaignRecipientDeliveryRepository(
    async () => await getDatabase() as unknown as AutomationDatabase,
  );
  return {
    ...recipientDelivery,
    async transaction<T>(actor: Actor, callback: (store: unknown) => Promise<T>): Promise<T> {
      requireAdmin(actor);
      const db = await getDatabase();
      return db.transaction(async (tx) => callback(tx));
    },

    async findCampaignByIdempotencyKey(actor, store, idempotencyKey, segmentId) {
      requireAdmin(actor);
      const parsedIdempotencyKey = idempotencyKeySchema.parse(idempotencyKey);
      const parsedSegmentId = segmentIdSchema.parse(segmentId);
      const db = asDb(store);
      const campaign = (await db.select({id: campaigns.id})
        .from(campaigns)
        .where(and(
          eq(campaigns.idempotencyKey, parsedIdempotencyKey),
          eq(campaigns.createdByProfileId, actor.profileId),
          eq(campaigns.segmentId, parsedSegmentId),
        ))
        .limit(1))[0];
      if (!campaign) return null;
      const parsedCampaign = campaignRowSchema.parse(campaign);
      const count = countRowSchema.parse((await db.select({count: sql<number>`count(*)`})
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, parsedCampaign.id)))[0]).count;
      return {campaignId: parsedCampaign.id, recipientCount: count};
    },

    async getSavedSegment(actor, store, segmentId) {
      requireAdmin(actor);
      return savedSegmentForActor(actor, store, segmentId);
    },

    async membersForSegment(actor, store, filter) {
      requireAdmin(actor);
      const parsedFilter = segmentFilterSchema.parse(filter);
      return campaignAudience(store, parsedFilter);
    },

    async createCampaign(actor: Actor, store, input: QueueCampaignInput): Promise<CampaignQueueResult> {
      requireAdmin(actor);
      const parsedInput = queueCampaignSchema.parse(input);
      const segment = await savedSegmentForActor(actor, store, parsedInput.segmentId);
      if (!segment) throw new Error("Saved segment was not found");
      const db = asDb(store);
      const inserted = await db.insert(campaigns)
        .values({
          segmentId: parsedInput.segmentId,
          createdByProfileId: actor.profileId,
          template: parsedInput.template,
          localeStrategy: parsedInput.localeStrategy,
          idempotencyKey: parsedInput.idempotencyKey,
        })
        .onConflictDoNothing({target: campaigns.idempotencyKey})
        .returning({id: campaigns.id});
      if (inserted[0]) return {campaignId: campaignRowSchema.parse(inserted[0]).id, recipientCount: 0, disposition: "created"};
      const existing = await this.findCampaignByIdempotencyKey(actor, store, parsedInput.idempotencyKey, parsedInput.segmentId);
      if (!existing) throw new Error("Campaign idempotency claim was not visible");
      return {...existing, disposition: "existing"};
    },

    async insertRecipients(actor, store, campaignId, recipients) {
      requireAdmin(actor);
      const parsedRecipients = z.array(campaignRecipientSchema).parse(recipients);
      const parsedCampaignId = await ownedCampaign(actor, store, campaignId);
      if (!parsedRecipients.length) return;
      const db = asDb(store);
      await db.insert(campaignRecipients).values(parsedRecipients.map((recipient) => ({
        campaignId: parsedCampaignId,
        ...recipient,
        variables: recipient.variables,
      })));
    },

    async appendAudit(actor, store, campaignId, recipientCount) {
      requireAdmin(actor);
      const parsedRecipientCount = recipientCountSchema.parse(recipientCount);
      const parsedCampaignId = await ownedCampaign(actor, store, campaignId);
      const db = asDb(store);
      await db.insert(auditEvents).values({
        actorUserId: actor.profileId,
        actorType: actor.kind,
        action: "campaign.queued",
        targetType: "campaign",
        targetId: parsedCampaignId,
        metadata: {recipientCount: parsedRecipientCount},
      });
    },
  };
}

export const campaignsRepository = createCampaignsRepository(() => getDb());
