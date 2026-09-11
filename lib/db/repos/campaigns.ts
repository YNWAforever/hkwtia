import "server-only";

import {and, eq, ne, sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {
  createCampaignSchema,
  type CampaignAuditSummary,
  type CampaignInsertResult,
  type CampaignQueueDependencies,
  type CampaignQueueResult,
  type CampaignReport,
  type CampaignReviewDecision,
  type CreateCampaignRecord,
} from "@/lib/admin/campaigns";
import {SEGMENT_FILTER_VERSION, parseSegmentFilter, segmentIdSchema, type SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, campaignRecipients, campaigns, contacts, profiles, savedSegments} from "@/lib/db/server-schema";
import {
  createCampaignRecipientDeliveryRepository,
  type CampaignRecipientDeliveryRepository,
} from "@/lib/db/repos/campaign-recipient-delivery";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import {parseRecipientFactsRow, recipientFactsProjection, type RecipientFacts} from "@/lib/db/repos/message-eligibility";
import {projectedAudience} from "@/lib/db/repos/segments";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const savedSegmentRowSchema = z.object({id: z.string().uuid(), ownerProfileId: z.string(), filters: z.record(z.unknown()), filterVersion: z.number().int()});
const campaignRowSchema = z.object({id: z.string().uuid()});
const countRowSchema = z.object({count: z.coerce.number()});
const idempotencyKeySchema = z.string().uuid();
const campaignIdSchema = z.string().uuid();
const scheduledAtSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), "INVALID_SCHEDULED_AT");
const auditSummarySchema = z.object({
  action: z.enum(["campaign.queued", "campaign.drafted"]),
  eligible: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  byReason: z.record(z.number().int().nonnegative()),
}).strict();
const reviewDecisionSchema = z.discriminatedUnion("outcome", [
  z.object({outcome: z.literal("approved")}).strict(),
  z.object({outcome: z.literal("rejected"), reason: z.string().trim().min(1).max(500)}).strict(),
]);

/**
 * A queued row is one we are going to hand to a provider, so every variable it
 * carries has to be non-empty: `lib/channels/woztell.ts` sends
 * `variables[key] ?? ""` and Meta rejects an empty BODY parameter, which S-15
 * makes a permanent failure. The check is scoped to rows carrying a WhatsApp
 * number because that is exactly the set a template send addresses — an email
 * row's `displayName` has been allowed to be blank since M2 and turning that
 * into a 500 on the Queue button would be a regression, not a guard.
 */
function refuseEmptyTemplateVariable(
  value: Readonly<{status: string; whatsappNumber: string | null; variables: Record<string, string>}>,
  context: z.RefinementCtx,
): void {
  if (value.status !== "queued" || value.whatsappNumber === null) return;
  for (const [key, text] of Object.entries(value.variables)) {
    if (text.trim() === "") {
      context.addIssue({code: z.ZodIssueCode.custom, message: "EMPTY_TEMPLATE_VARIABLE", path: ["variables", key]});
    }
  }
}

const recipientCommon = {
  email: z.string().trim().email().nullable().default(null),
  whatsappNumber: z.string().trim().min(1).max(32).nullable().default(null),
  locale: z.string().min(1).max(10),
  variables: z.record(z.string()),
  status: z.enum(["queued", "suppressed"]).default("queued"),
  blockedReason: z.string().trim().min(1).max(64).nullable().default(null),
};

/**
 * S-4 in one parse. The two arms are `.strict()`, so a row naming BOTH
 * identities matches neither and a row naming neither matches neither — the
 * Zod boundary and `campaign_recipients_identity_check` state the same rule,
 * and the database's version exists for the writer nobody has written yet.
 */
const campaignRecipientSchema = z.union([
  z.object({profileId: z.string().min(1).max(255), ...recipientCommon}).strict().superRefine(refuseEmptyTemplateVariable),
  z.object({contactId: z.string().uuid(), ...recipientCommon}).strict().superRefine(refuseEmptyTemplateVariable),
]);

type DbExecutor = Pick<Awaited<ReturnType<typeof getDb>>, "select" | "insert" | "execute">;

function asDb(store: unknown): DbExecutor {
  return store as DbExecutor;
}

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function savedSegmentForActor(actor: AdminActor, store: unknown, segmentId: string) {
  const parsedSegmentId = segmentIdSchema.parse(segmentId);
  const db = asDb(store);
  // `filterVersion` is selected only so the filters can be dispatched on it: a
  // campaign built from a segment read at the wrong version addresses the wrong
  // people, and the snapshot on `campaign_recipients` would make that permanent.
  const row = (await db.select({id: savedSegments.id, ownerProfileId: savedSegments.ownerProfileId, filters: savedSegments.filters, filterVersion: savedSegments.filterVersion})
    .from(savedSegments)
    .where(and(eq(savedSegments.id, parsedSegmentId), eq(savedSegments.ownerProfileId, actor.profileId)))
    .limit(1))[0];
  if (!row) return null;
  const parsed = savedSegmentRowSchema.parse(row);
  return {...parsed, filters: parseSegmentFilter(parsed.filterVersion, parsed.filters)};
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

/**
 * S-7. Two-person control as a property of the row rather than of a screen.
 * `ownedCampaign` is untouched and still gates every creator write; this is its
 * deliberate inverse, and the inequality is the whole authorization: an admin
 * cannot approve the campaign they wrote.
 *
 * The reviewer reads the campaign row and the eligibility counts already
 * snapshotted onto `campaign_recipients`, never `saved_segments`. That is what
 * the snapshot is for — it makes the reviewable object campaign-scoped, so
 * segment ownership (which names member emails) stays owner-only.
 */
async function reviewableCampaign(actor: AdminActor, store: unknown, campaignId: string): Promise<string> {
  const parsedCampaignId = campaignIdSchema.parse(campaignId);
  const db = asDb(store);
  const row = (await db.select({id: campaigns.id})
    .from(campaigns)
    .where(and(eq(campaigns.id, parsedCampaignId), ne(campaigns.createdByProfileId, actor.profileId)))
    .limit(1))[0];
  if (!row) throw new Error("Campaign is not reviewable by this actor");
  return campaignRowSchema.parse(row).id;
}

function statusList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

async function transitionCampaign(
  db: DbExecutor,
  campaignId: string,
  from: readonly string[],
  assignment: SQL,
): Promise<void> {
  const rows = resultRows(await db.execute(sql`
    UPDATE ${campaigns} AS target
    SET ${assignment}, updated_at = now()
    WHERE target.id = ${campaignId}::uuid
      AND target.status IN (${statusList(from)})
    RETURNING target.id
  `));
  // A transition that matched nothing is a stale screen, not a silent no-op:
  // two admins on the same campaign would otherwise both be told the approval
  // landed.
  if (!rows.length) throw new Error("Campaign is not in a state that allows this transition");
}

async function appendCampaignAudit(
  db: DbExecutor,
  actor: AdminActor,
  campaignId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditEvents).values({
    actorUserId: actor.profileId,
    actorType: actor.kind,
    action,
    targetType: "campaign",
    targetId: campaignId,
    metadata,
  });
}

/**
 * The audience, as facts rather than as a verdict.
 *
 * What this replaced projected a `suppressed` flag from
 * `EXISTS(… email_log.status = 'suppressed')` — a value `DeliveryStatus`
 * (`processing｜sent｜failed`) has never contained and no writer in the tree has
 * ever written, so the column had been constant `false` since M2 and the
 * "suppressed" category of the preview was decorative. Real suppression is
 * `message_suppressions` per channel for a member and
 * `contacts.whatsapp_opted_out_at` for a prospect, and both are read here
 * through `recipientFactsProjection`, the same projection the inbox's
 * eligibility door reads. One reader, so a preview and a send cannot disagree
 * about a person.
 *
 * No `channel` parameter: the facts are channel-independent and
 * `classifyRecipient` is where the channel enters. A channel argument here
 * would imply the SQL filtered on it, and the first person to believe that
 * would drop the other channel's audience.
 *
 * The `filter.audience === "contacts" → []` guard this replaced is gone, and
 * deliberately. It existed because `campaign_recipients` was profile-keyed and
 * a contacts segment queued through the email shortcut would have fallen
 * through to the member arm and mailed the whole membership. The snapshot is
 * identity-polymorphic now, and a prospect's `marketingConsent` is `false` by
 * construction, so every contact in an email campaign lands `not_opted_in` —
 * visible in the report, and never in a state the claim loop can see. The
 * remaining layer, `memberPredicates` answering FALSE to a contact-shaped
 * filter, is untouched.
 */
/**
 * The join back to `contacts` is spelled `contacts.id::text = audience."id"` and
 * never `audience."id"::uuid`: a member row's id is a text profile id, and
 * Postgres is free to evaluate the cast before the `kind` test, which would
 * fail the whole statement on the first mixed-audience segment.
 */
function audienceTargets(filter: SegmentFilterSet, now: Date): SQL {
  return sql`
    SELECT
      audience."kind" AS kind,
      audience."id" AS id,
      -- The suppression sub-selects scope on profile_id, which for a prospect
      -- is the optional member link C-4 writes. That is how a contact can be
      -- suppressed at all, given message_suppressions.profile_id is NOT NULL.
      COALESCE(${contacts.profileId}, ${profiles.id}) AS profile_id,
      audience."displayName" AS display_name,
      audience."email" AS email,
      audience."whatsappNumber" AS whatsapp_number,
      COALESCE(${profiles.locale}, ${contacts.locale}) AS locale,
      COALESCE(${profiles.consentMarketing}, false) AS marketing_consent,
      audience."whatsappOptIn" AS whatsapp_opt_in,
      ${contacts.whatsappOptedOutAt} AS whatsapp_opted_out_at
    FROM (${projectedAudience(filter, now)}) AS audience
    LEFT JOIN ${profiles} ON audience."kind" = 'member' AND ${profiles.id} = audience."id"
    LEFT JOIN ${contacts} ON audience."kind" = 'contact' AND ${contacts.id}::text = audience."id"
  `;
}

async function campaignAudience(store: unknown, filter: SegmentFilterSet, now: Date): Promise<readonly RecipientFacts[]> {
  const db = asDb(store);
  const rows = await db.execute(sql`
    SELECT facts.* FROM (${recipientFactsProjection(audienceTargets(filter, now))}) AS facts
    ORDER BY facts."kind", facts."id"
  `);
  return resultRows(rows).map(parseRecipientFactsRow);
}

export type CampaignDbProvider = () => Promise<Awaited<ReturnType<typeof getDb>>>;
export type CampaignsRepository =
  & CampaignQueueDependencies
  & CampaignRecipientDeliveryRepository
  & Readonly<{
    submitForReview: (actor: Actor, store: unknown, campaignId: string) => Promise<void>;
    recordReview: (actor: Actor, store: unknown, campaignId: string, decision: CampaignReviewDecision) => Promise<void>;
    schedule: (actor: Actor, store: unknown, campaignId: string, scheduledAt: Date) => Promise<void>;
    campaignReportFor: (actor: Actor, store: unknown, campaignId: string) => Promise<CampaignReport>;
  }>;

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
      // Only the sendable rows, because the snapshot now also holds everyone
      // the campaign could not reach. Counting all of them would report a
      // recovered draft as larger than the one that was just created, from the
      // same audience.
      const count = countRowSchema.parse((await db.select({count: sql<number>`count(*)`})
        .from(campaignRecipients)
        .where(and(eq(campaignRecipients.campaignId, parsedCampaign.id), sql`${campaignRecipients.blockedReason} IS NULL`)))[0]).count;
      return {campaignId: parsedCampaign.id, recipientCount: count};
    },

    async getSavedSegment(actor, store, segmentId) {
      requireAdmin(actor);
      return savedSegmentForActor(actor, store, segmentId);
    },

    async audienceForSegment(actor, store, filter) {
      requireAdmin(actor);
      // The caller hands over an already-dispatched filter set, so this is the
      // current version by construction; it still re-parses at the repository
      // boundary because `store` is caller-supplied and this is the last gate
      // before the audience SQL is built.
      const parsedFilter = parseSegmentFilter(SEGMENT_FILTER_VERSION, filter);
      // One clock for the whole audience read, for the same reason `preview`
      // takes one: the relative renewal and last-login windows must not move
      // between the count a human approved and the rows that get snapshotted.
      return campaignAudience(store, parsedFilter, new Date());
    },

    async createCampaign(actor: Actor, store, input): Promise<CampaignQueueResult> {
      requireAdmin(actor);
      const parsedInput: CreateCampaignRecord = createCampaignSchema.parse(input);
      const segment = await savedSegmentForActor(actor, store, parsedInput.segmentId);
      if (!segment) throw new Error("Saved segment was not found");
      const db = asDb(store);
      const inserted = await db.insert(campaigns)
        .values({
          segmentId: parsedInput.segmentId,
          createdByProfileId: actor.profileId,
          name: parsedInput.name,
          channel: parsedInput.channel,
          template: parsedInput.template,
          templateKey: parsedInput.templateKey,
          variablesTemplate: parsedInput.variablesTemplate,
          status: parsedInput.status,
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

    async insertRecipients(actor, store, campaignId, recipients): Promise<CampaignInsertResult> {
      requireAdmin(actor);
      const parsedRecipients = z.array(campaignRecipientSchema).parse(recipients);
      const parsedCampaignId = await ownedCampaign(actor, store, campaignId);
      if (!parsedRecipients.length) return {inserted: 0, skipped: 0};
      const db = asDb(store);
      // The BARE, targetless ON CONFLICT DO NOTHING: it covers every constraint
      // on the table, so it needs no conflict target and therefore no verbatim
      // repetition of each partial unique index's WHERE predicate. `createCampaign`
      // directly above is already idempotent on `idempotencyKey`, so without
      // this a re-entered wizard step or a retried snapshot raised 23505
      // against the two partial indexes and surfaced as a 500 on "Create draft".
      const written = await db.insert(campaignRecipients).values(parsedRecipients.map((recipient) => ({
        campaignId: parsedCampaignId,
        ...recipient,
      })))
        .onConflictDoNothing()
        .returning({id: campaignRecipients.id});
      return {inserted: written.length, skipped: parsedRecipients.length - written.length};
    },

    async appendAudit(actor, store, campaignId, summary: CampaignAuditSummary) {
      requireAdmin(actor);
      const {action, ...metadata} = auditSummarySchema.parse(summary);
      const parsedCampaignId = await ownedCampaign(actor, store, campaignId);
      // `recipientCount` alone overstated the audience by exactly the number of
      // rows the old dead `suppressed` flag failed to catch, so the metadata
      // records the split and the reasons instead.
      await appendCampaignAudit(asDb(store), actor, parsedCampaignId, action, metadata);
    },

    async submitForReview(actor, store, campaignId) {
      requireAdmin(actor);
      const parsedCampaignId = await ownedCampaign(actor, store, campaignId);
      const db = asDb(store);
      await transitionCampaign(db, parsedCampaignId, ["draft"], sql`status = 'review', rejection_reason = NULL`);
      await appendCampaignAudit(db, actor, parsedCampaignId, "campaign.submitted_for_review", {});
    },

    async recordReview(actor, store, campaignId, decision) {
      requireAdmin(actor);
      const parsed = reviewDecisionSchema.parse(decision);
      const parsedCampaignId = await reviewableCampaign(actor, store, campaignId);
      const db = asDb(store);
      if (parsed.outcome === "approved") {
        await transitionCampaign(db, parsedCampaignId, ["review"], sql`
          reviewed_at = now(), reviewed_by_profile_id = ${actor.profileId}, rejection_reason = NULL
        `);
        await appendCampaignAudit(db, actor, parsedCampaignId, "campaign.review.approved", {});
        return;
      }
      // Back to `draft`, not `failed`: S-6 gives `failed` to the promotion step,
      // and a rejected campaign is meant to be fixed and re-submitted rather
      // than buried in a state the wizard cannot leave.
      await transitionCampaign(db, parsedCampaignId, ["review"], sql`
        status = 'draft', reviewed_at = now(), reviewed_by_profile_id = ${actor.profileId},
        rejection_reason = ${parsed.reason}
      `);
      await appendCampaignAudit(db, actor, parsedCampaignId, "campaign.review.rejected", {reason: parsed.reason});
    },

    async schedule(actor, store, campaignId, scheduledAt) {
      requireAdmin(actor);
      const parsedScheduledAt = scheduledAtSchema.parse(scheduledAt);
      const parsedCampaignId = await reviewableCampaign(actor, store, campaignId);
      const db = asDb(store);
      // `reviewed_at IS NOT NULL` is the second half of two-person control: the
      // approval and the schedule are two clicks, and a schedule written
      // without the approval would be a blast nobody signed off.
      const rows = resultRows(await db.execute(sql`
        UPDATE ${campaigns} AS target
        SET status = 'scheduled', scheduled_at = ${parsedScheduledAt}, updated_at = now()
        WHERE target.id = ${parsedCampaignId}::uuid
          AND target.status = 'review'
          AND target.reviewed_at IS NOT NULL
        RETURNING target.id
      `));
      if (!rows.length) throw new Error("Campaign is not in a state that allows this transition");
      await appendCampaignAudit(db, actor, parsedCampaignId, "campaign.scheduled", {scheduledAt: parsedScheduledAt.toISOString()});
    },

    /**
     * An admin read, not a creator-scoped one: the reviewer has to see the
     * counts they are approving, and after the blast both of them have to see
     * what happened. Served by `campaign_recipients_campaign_status_idx`.
     */
    async campaignReportFor(actor, store, campaignId): Promise<CampaignReport> {
      requireAdmin(actor);
      const parsedCampaignId = campaignIdSchema.parse(campaignId);
      const rows = z.array(reportRowSchema).parse(resultRows(await asDb(store).execute(sql`
        SELECT
          ${campaignRecipients.status}::text AS "status",
          ${campaignRecipients.blockedReason} AS "blockedReason",
          count(*)::int AS "count",
          count(*) FILTER (WHERE ${campaignRecipients.deliveredAt} IS NOT NULL)::int AS "delivered",
          count(*) FILTER (WHERE ${campaignRecipients.readAt} IS NOT NULL)::int AS "read"
        FROM ${campaignRecipients}
        WHERE ${campaignRecipients.campaignId} = ${parsedCampaignId}::uuid
        GROUP BY 1, 2
      `)));
      return foldReport(rows);
    },
  };
}

const reportRowSchema = z.object({
  status: z.enum(["queued", "processing", "sent", "failed", "suppressed"]),
  blockedReason: z.string().nullable(),
  count: z.coerce.number().int().nonnegative(),
  delivered: z.coerce.number().int().nonnegative(),
  read: z.coerce.number().int().nonnegative(),
});

function foldReport(rows: readonly z.infer<typeof reportRowSchema>[]): CampaignReport {
  const byReason: Record<string, number> = {};
  const report = {total: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, blocked: 0};
  for (const row of rows) {
    report.total += row.count;
    report.delivered += row.delivered;
    report.read += row.read;
    if (row.status === "queued" || row.status === "processing") report.queued += row.count;
    if (row.status === "sent") report.sent += row.count;
    if (row.status === "failed") report.failed += row.count;
    if (row.blockedReason !== null) {
      report.blocked += row.count;
      byReason[row.blockedReason] = (byReason[row.blockedReason] ?? 0) + row.count;
    }
  }
  return {...report, byReason};
}

export const campaignsRepository = createCampaignsRepository(() => getDb());
