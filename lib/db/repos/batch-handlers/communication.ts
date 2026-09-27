import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import "server-only";

import {createHash} from "node:crypto";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {snapshotAudience} from "@/lib/admin/campaigns";
import {classifyRecipient} from "@/lib/admin/campaign-eligibility";
import {resolveMemberSelectionIds} from "@/lib/admin/batches/selection";
import {batchPreviewDigest, type BatchRequest, type BatchTarget} from "@/lib/admin/batches/types";
import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {requireAdmin} from "@/lib/auth/authorize";
import {requireAutomationSystem, type AutomationRepositoryActor} from "@/lib/auth/automation-actor";
import {appEnv} from "@/lib/config/env";
import type {BatchExecutor} from "@/lib/db/repos/admin-batches";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {getDb} from "@/lib/db/repos/common";
import {notificationActor} from "@/lib/db/repos/deliveries";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import {createMessageEligibilityRepository, type RecipientFacts} from "@/lib/db/repos/message-eligibility";
import {membershipGrantValiditySql} from "@/lib/db/repos/membership-grant-sql";
import {adminBatchItems, adminBatches, campaigns, campaignRecipients, companies, companyMembers, memberships, profiles, whatsappTemplates, auditEvents} from "@/lib/db/server-schema";
import {localizedPath} from "@/lib/urls";

type Request = Extract<BatchRequest, {operation: "renewal_reminder" | "profile_update_invite"}>;
const deliveryActor = notificationActor("campaign");
const memberSchema = z.object({profileId: z.string().nullable(), membershipId: z.string().uuid(), companyId: z.string().uuid().nullable(), companyName: z.string().nullable(), planCode: z.string(), status: z.string(), renewalAt: z.coerce.date().nullable(), grantValid: z.boolean()});
function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
function uuidFor(value: string) {const hex = createHash("sha256").update(value).digest("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
function isRequest(request: BatchRequest): request is Request {return request.operation === "renewal_reminder" || request.operation === "profile_update_invite";}
function enabled() {return process.env.MEMBER_COMMUNICATION_BATCH_ENABLED === "true";}

async function membershipsFor(tx: BatchExecutor, ids: readonly string[]) {
  if (!ids.length) return [];
  return z.array(memberSchema).parse(rows(await tx.execute(sql`SELECT ${memberships.id} AS "membershipId", ${memberships.companyId} AS "companyId", ${companies.displayName} AS "companyName", ${memberships.planCode} AS "planCode", ${memberships.status} AS status, ${memberships.billingPeriodEnd} AS "renewalAt", ${membershipGrantValiditySql()} AS "grantValid",
    coalesce(${memberships.ownerUserId}, (SELECT CASE WHEN count(*) = 1 THEN min(${companyMembers.userId}) ELSE NULL END FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${memberships.companyId} AND ${companyMembers.role} = 'owner' AND ${companyMembers.revokedAt} IS NULL)) AS "profileId"
    FROM ${memberships} LEFT JOIN ${companies} ON ${companies.id} = ${memberships.companyId} WHERE ${memberships.id} = ANY(ARRAY[${sql.join(ids.map(id=>sql`${id}::uuid`),sql`, `)}]::uuid[])`)));
}
async function contextFor(tx: BatchExecutor, target: BatchTarget) {
  const membership = target.type === "membership" ? (await membershipsFor(tx, [target.id]))[0] ?? null : null;
  const profileId = target.type === "profile" ? target.id : membership?.profileId;
  if (!profileId) return null;
  const role = z.array(z.object({role: z.string()})).parse(rows(await tx.execute(sql`SELECT ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${profileId}`)))[0]?.role;
  if (role !== "member") return null;
  const loader = createMessageEligibilityRepository(async () => tx as AutomationDatabase);
  const current = await loader.factsFor(deliveryActor, {kind: "member", profileId});
  if (!current) return null;
  return contextFrom(current, membership);
}
function contextFrom(current: RecipientFacts, membership: z.infer<typeof memberSchema> | null) {
  const profileId=current.id;
  // Consent comes from the one existing facts loader; renewal content/eligibility comes from the EXACT selected membership.
  const facts: RecipientFacts = membership ? {...current, membershipStatus: membership.grantValid ? membership.status : null, planCode: membership.planCode, renewalAt: membership.renewalAt} : current;
  const snapshot = {profileId, displayName: facts.displayName, email: facts.email, whatsappNumber: facts.whatsappNumber, locale: facts.locale, membershipId: membership?.membershipId ?? null, companyId: membership?.companyId ?? null, companyName: membership?.companyName ?? null, planCode: facts.planCode, renewalAt: facts.renewalAt?.toISOString() ?? null};
  return {facts, snapshot};
}
async function blockReason(tx: BatchExecutor, context: NonNullable<Awaited<ReturnType<typeof contextFor>>>, request: Request, checks?: {shared: ReadonlySet<string>; templateApproved: boolean}) {
  if (!enabled()) return "COMMUNICATION_DISABLED";
  const {facts, snapshot} = context;
  const eligibility = classifyRecipient(facts, request.payload.channel);
  if (eligibility !== "eligible") return eligibility;
  if (request.operation === "renewal_reminder" && !snapshot.renewalAt) return "RENEWAL_DATE_MISSING";
  // Shared contact points are ambiguous; never dedupe across companies and expose one account's renewal to another.
  const point = (request.payload.channel === "email" ? facts.email?.trim().toLowerCase() : facts.whatsappNumber?.trim()) ?? "";
  const duplicates = checks ? (checks.shared.has(point) ? [point] : []) : rows(await tx.execute(request.payload.channel === "email"
    ? sql`SELECT id FROM ${profiles} WHERE lower(trim(email)) = lower(trim(${facts.email})) AND id <> ${facts.id} LIMIT 1`
    : sql`SELECT id FROM ${profiles} WHERE trim(whatsapp_number) = trim(${facts.whatsappNumber}) AND id <> ${facts.id} LIMIT 1`));
  if (duplicates.length) return "SHARED_CONTACT_POINT";
  if (request.payload.channel === "whatsapp") {
    // No approved profile-update template or zh-HK renewal variant exists in this catalogue.
    if (request.operation !== "renewal_reminder" || facts.locale !== "en") return "template_not_approved";
    const approved = checks ? (checks.templateApproved ? [true] : []) : rows(await tx.execute(sql`SELECT key FROM ${whatsappTemplates} WHERE key = 'renewal_14' AND status = 'approved' AND language_code = ${WHATSAPP_TEMPLATES.renewal_14.languageCode}`));
    if (!approved.length) return "template_not_approved";
  }
  return null;
}

export const communicationBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    requireAdmin(actor);
    if (!isRequest(request)) throw new Error("BATCH_OPERATION_MISMATCH");
    if (!enabled()) throw new Error("BATCH_OPERATION_UNAVAILABLE");
    const segment = await campaignsRepository.getSavedSegment(actor, tx, request.payload.segmentId);
    if (!segment) throw new Error("CAMPAIGN_SEGMENT_NOT_FOUND");
    const targets: BatchTarget[] = request.operation === "renewal_reminder"
      ? [...new Set(request.membershipIds)].map((id) => ({type: "membership", id}))
      : (await resolveMemberSelectionIds(actor, request.selection, tx)).map((id) => ({type: "profile", id}));
    const selectedMemberships = request.operation === "renewal_reminder" ? await membershipsFor(tx, targets.map(target=>target.id)) : [];
    const membershipMap = new Map(selectedMemberships.map(row=>[row.membershipId,row]));
    const profileIds = [...new Set(targets.flatMap(target=>target.type === "profile" ? [target.id] : membershipMap.get(target.id)?.profileId ? [membershipMap.get(target.id)!.profileId!] : []))];
    const loader=createMessageEligibilityRepository(async()=>tx as AutomationDatabase);
    const facts=profileIds.length ? await loader.factsForMembers(deliveryActor,profileIds) : [];
    const factsMap=new Map(facts.map(row=>[row.id,row]));
    const contexts=targets.map(target=>{const membership=target.type === "membership" ? membershipMap.get(target.id)??null : null;const id=target.type === "profile" ? target.id : membership?.profileId;const current=id?factsMap.get(id):null;return current?contextFrom(current,membership):null;});
    const {projectedAudience}=await import("@/lib/db/repos/segments");
    const inSegment=new Set(z.array(z.object({id:z.string()})).parse(rows(await tx.execute(sql`WITH selected AS (${projectedAudience(segment.filters,new Date())}) SELECT id FROM selected WHERE kind='member' AND id=ANY(ARRAY[${sql.join(profileIds.map(id=>sql`${id}`),sql`, `)}]::text[]) LIMIT 5001`))).map(row=>row.id));
    const shared = new Set(z.array(z.object({point:z.string()})).parse(rows(await tx.execute(request.payload.channel === "email"
      ? sql`SELECT lower(trim(email)) AS point FROM ${profiles} WHERE email IS NOT NULL GROUP BY lower(trim(email)) HAVING count(*)>1`
      : sql`SELECT trim(whatsapp_number) AS point FROM ${profiles} WHERE whatsapp_number IS NOT NULL GROUP BY trim(whatsapp_number) HAVING count(*)>1`))).map(row=>row.point));
    const templateApproved=request.payload.channel !== "whatsapp" || rows(await tx.execute(sql`SELECT key FROM ${whatsappTemplates} WHERE key='renewal_14' AND status='approved' AND language_code=${WHATSAPP_TEMPLATES.renewal_14.languageCode}`)).length>0;
    const counts = new Map<string, number>();
    for (const context of contexts) if (context) counts.set(context.facts.id, (counts.get(context.facts.id) ?? 0) + 1);
    const preview = [];
    for (const [index, target] of targets.entries()) {
      const context = contexts[index];
      const reasonCode = !context ? "RECIPIENT_NOT_FOUND" : !inSegment.has(context.facts.id) ? "OUTSIDE_SEGMENT" : counts.get(context.facts.id)! > 1 ? "MULTIPLE_MEMBERSHIPS_SELECTED" : await blockReason(tx, context, request, {shared,templateApproved});
      const before = context?.snapshot ?? {};
      preview.push({target, previewStatus: reasonCode ? "blocked" as const : "eligible" as const, eligible: !reasonCode, reasonCode, expectedVersion: batchPreviewDigest(before), before, after: {channel: request.payload.channel, classification: "marketing", result: "campaign_draft_requires_review"}});
    }
    return preview;
  },
  async execute(actor, claim, tx) {
    requireAdmin(actor);
    const request = claim.request;
    if (!isRequest(request) || request.operation !== claim.operation || (request.operation === "renewal_reminder" ? claim.target.type !== "membership" : claim.target.type !== "profile")) return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    if (!enabled()) return {status: "skipped", reasonCode: "COMMUNICATION_DISABLED"};
    const context = await contextFor(tx, claim.target);
    if (!context || batchPreviewDigest(context.snapshot) !== claim.expectedVersion) return {status: "skipped", reasonCode: "COMMUNICATION_CHANGED"};
    const reason = await blockReason(tx, context, request);
    if (reason) return {status: "skipped", reasonCode: reason};
    const segment = await campaignsRepository.getSavedSegment(actor, tx, request.payload.segmentId);
    if (!segment) return {status: "skipped", reasonCode: "CAMPAIGN_SEGMENT_NOT_FOUND"};
    const {facts} = context;
    const channel = request.payload.channel;
    const campaign = await campaignsRepository.createCampaign(actor, tx, {segmentId: segment.id, idempotencyKey: uuidFor(`${claim.batchId}:${facts.locale}`), name: `${request.operation} ${claim.batchId.slice(0,8)} ${facts.locale}`, channel, template: channel === "email" ? request.operation === "renewal_reminder" ? "batch-renewal-reminder" : "batch-profile-update" : null, templateKey: channel === "whatsapp" ? "renewal_14" : null, variablesTemplate: {_batchId: claim.batchId}, status: "draft"});
    const locked = z.array(z.object({status: z.string()})).parse(rows(await tx.execute(sql`SELECT status FROM ${campaigns} WHERE id = ${campaign.campaignId}::uuid FOR UPDATE`)))[0];
    if (locked?.status !== "draft") return {status: "skipped", reasonCode: "CAMPAIGN_FROZEN"};
    const ctaUrl = new URL(localizedPath(facts.locale, request.operation === "renewal_reminder" ? "/portal/billing" : "/portal/profile"), appEnv().appUrl).toString();
    const snapshot = snapshotAudience([facts], {channel, templateVariables: channel === "whatsapp" ? WHATSAPP_TEMPLATES.renewal_14.variables : [], variablesTemplate: {memberName: "{{displayName}}", renewalDate: "{{renewalDate}}", renewalUrl: ctaUrl}});
    const recipient = snapshot.rows[0]!;
    if (recipient.status !== "queued") return {status: "skipped", reasonCode: recipient.blockedReason ?? "COMMUNICATION_CHANGED"};
    await campaignsRepository.insertRecipients(actor, tx, campaign.campaignId, [{...recipient, variables: {...recipient.variables, ctaUrl, planName: ((facts.locale === "en" ? en : zh).Portal.plans as Record<string,string>)[facts.planCode ?? ""] ?? "", membershipScope: context.snapshot.companyName ?? facts.displayName, _batchItemId: claim.itemId}}]);
    await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES (${actor.profileId},${actor.kind},'campaign.batch_recipient_drafted','campaign',${campaign.campaignId},jsonb_build_object('batchId',${claim.batchId}::text,'effectKey',${claim.effectKey}::text))`);
    return {status: "succeeded", resultRef: campaign.campaignId};
  },
};

export type CommunicationClaim = Readonly<{id: string; campaignId: string; profileId: string | null; locale: "en" | "zh-HK"; variables: Readonly<Record<string,string>>}>;
/** Extra fail-closed guard for batch-origin campaigns. Existing campaigns retain their existing consent gate. */
export async function recheckBatchCommunication(actor: AutomationRepositoryActor, claim: CommunicationClaim, channel: "email" | "whatsapp", loadDatabase: () => Promise<BatchExecutor> = getDb): Promise<string | null> {
  requireAutomationSystem(actor);
  if (!claim.variables._batchItemId) return null;
  if (!enabled()) return "COMMUNICATION_DISABLED";
  const parsed = z.string().uuid().safeParse(claim.variables._batchItemId);
  if (!parsed.success) return "COMMUNICATION_CHANGED";
  const tx = await loadDatabase();
  const row = z.object({targetType: z.enum(["profile","membership"]), targetId: z.string(), expectedVersion: z.string(), selection: z.unknown(), actorRole: z.string().nullable()}).nullable().parse(rows(await tx.execute(sql`SELECT i.target_type AS "targetType", i.target_id AS "targetId", i.expected_version AS "expectedVersion", b.selection_snapshot AS selection, p.role AS "actorRole"
    FROM ${adminBatchItems} i JOIN ${adminBatches} b ON b.id=i.batch_id JOIN ${campaigns} c ON c.id=${claim.campaignId}::uuid JOIN ${campaignRecipients} r ON r.id=${claim.id}::uuid AND r.campaign_id=c.id LEFT JOIN ${profiles} p ON p.id=b.actor_profile_id
    WHERE i.id=${parsed.data}::uuid AND i.state='succeeded' AND i.result_ref=c.id::text AND c.variables_template->>'_batchId'=b.id::text AND r.profile_id=${claim.profileId}`))[0] ?? null);
  if (!row || !["staff","exco","superadmin"].includes(row.actorRole ?? "")) return "COMMUNICATION_CHANGED";
  const {batchRequestSchema} = await import("@/lib/admin/batches/types");
  const request = batchRequestSchema.parse(row.selection);
  if (!isRequest(request) || request.payload.channel !== channel) return "COMMUNICATION_CHANGED";
  const context = await contextFor(tx, {type: row.targetType, id: row.targetId});
  if (!context || context.facts.id !== claim.profileId || context.facts.locale !== claim.locale || batchPreviewDigest(context.snapshot) !== row.expectedVersion) return "COMMUNICATION_CHANGED";
  return await blockReason(tx, context, request);
}

export type CommunicationTargets = Readonly<{members: readonly {id: string; name: string; email: string | null}[]; renewals: readonly {id: string; name: string; planCode: string; scope: string; renewalAt: string | null}[]}>;
/** Bounded staff discovery; the worker rechecks ownership and eligibility before preparing any effect. */
export async function listCommunicationTargets(actor: import("@/lib/membership/lifecycle").Actor, segmentId: string, loadDatabase: () => Promise<BatchExecutor> = getDb): Promise<CommunicationTargets> {
  requireAdmin(actor);
  const tx = await loadDatabase();
  const segment = await campaignsRepository.getSavedSegment(actor, tx, z.string().uuid().parse(segmentId));
  if (!segment) throw new Error("CAMPAIGN_SEGMENT_NOT_FOUND");
  const {projectedAudience} = await import("@/lib/db/repos/segments");
  const selected = z.array(z.object({id:z.string(),name:z.string(),email:z.string().nullable()})).parse(rows(await tx.execute(sql`WITH selected AS (${projectedAudience(segment.filters,new Date())}) SELECT id,"displayName" AS name,email FROM selected WHERE kind='member' ORDER BY "displayName",id LIMIT 5001`)));
  if (selected.length > 5000) throw new Error("BATCH_TOO_LARGE");
  if (!selected.length) return {members:[],renewals:[]};
  const ids = sql`ARRAY[${sql.join(selected.map(row=>sql`${row.id}`),sql`, `)}]::text[]`;
  const renewalRows = z.array(z.object({id:z.string().uuid(),profileId:z.string(),planCode:z.string(),scope:z.string().nullable(),renewalAt:z.coerce.date().nullable()})).parse(rows(await tx.execute(sql`SELECT m.id,p.id AS "profileId",m.plan_code AS "planCode",c.display_name AS scope,m.billing_period_end AS "renewalAt" FROM ${memberships} m JOIN ${profiles} p ON p.id=m.owner_user_id OR EXISTS (SELECT 1 FROM ${companyMembers} cm WHERE cm.company_id=m.company_id AND cm.user_id=p.id AND cm.role='owner' AND cm.revoked_at IS NULL) LEFT JOIN ${companies} c ON c.id=m.company_id WHERE p.id=ANY(${ids}) AND m.status IN ('active','past_due','cancel_at_period_end') ORDER BY m.billing_period_end,m.id LIMIT 5001`)));
  if (renewalRows.length > 5000) throw new Error("BATCH_TOO_LARGE");
  const names = new Map(selected.map(row=>[row.id,row.name]));
  return {members:selected,renewals:renewalRows.map(row=>({id:row.id,name:names.get(row.profileId)!,planCode:row.planCode,scope:row.scope??names.get(row.profileId)!,renewalAt:row.renewalAt?.toISOString()??null}))};
}
