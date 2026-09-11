import "server-only";

import {z} from "zod";

import {
  campaignEmailFor,
  campaignNumberFor,
  classifyRecipient,
  resolveRecipientVariables,
  type CampaignChannel,
} from "@/lib/admin/campaign-eligibility";
import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";
import type {Actor} from "@/lib/membership/lifecycle";

/** The `/admin/segments` shortcut's input (S-17): email, immediate, no review. */
export const queueCampaignSchema = z.object({
  segmentId: z.string().uuid(),
  template: z.string().trim().min(1).max(100),
  localeStrategy: z.literal("profile").default("profile"),
  idempotencyKey: z.string().uuid(),
}).strict();
export const campaignDraftSchema = z.string().uuid();

/**
 * What the repository's `createCampaign` accepts, for both writers. The
 * shortcut's four keys are a subset with defaults, so `queueCampaign` still
 * hands its own parsed input straight through.
 *
 * The two template checks mirror `campaigns_email_template_check` and
 * `campaigns_whatsapp_template_check` rather than trusting them: a 23514 from
 * Postgres surfaces as a 500 on "Create draft" with nothing a staff member can
 * act on, and the database constraint exists for the writer nobody has written
 * yet, not for this one.
 */
export const createCampaignSchema = z.object({
  segmentId: z.string().uuid(),
  name: z.string().trim().min(1).max(140).nullable().default(null),
  channel: z.enum(["email", "whatsapp"]).default("email"),
  template: z.string().trim().min(1).max(100).nullable().default(null),
  templateKey: z.string().trim().min(1).max(100).nullable().default(null),
  variablesTemplate: z.record(z.string().max(1000)).default({}),
  localeStrategy: z.literal("profile").default("profile"),
  idempotencyKey: z.string().uuid(),
  status: z.enum(["draft", "queued"]).default("queued"),
}).strict().superRefine((value, context) => {
  if (value.channel === "email" && value.template === null) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "EMAIL_CAMPAIGN_REQUIRES_TEMPLATE", path: ["template"]});
  }
  if (value.channel === "whatsapp" && value.templateKey === null) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "WHATSAPP_CAMPAIGN_REQUIRES_TEMPLATE_KEY", path: ["templateKey"]});
  }
});

export type QueueCampaignInput = z.infer<typeof queueCampaignSchema>;
/**
 * The INPUT type, not the parsed one: every key but `segmentId` and
 * `idempotencyKey` has a default, and a caller that has to spell out
 * `channel: "email", status: "queued", name: null, templateKey: null,
 * variablesTemplate: {}` to queue an email campaign will eventually spell one
 * of them wrong. The repository re-parses, so the defaults are applied once,
 * at the boundary.
 */
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;
export type CreateCampaignRecord = z.output<typeof createCampaignSchema>;

/**
 * A snapshotted recipient. Both arms carry a `status` and a `blockedReason`
 * because `insertRecipients` snapshots the WHOLE audience, not only the
 * sendable part: the count a second admin approves has to survive the segment
 * changing underneath it, and a blocked row is the only durable record of who
 * the campaign could not reach and why.
 */
export type CampaignRecipientSnapshot = Readonly<{
  profileId?: string;
  contactId?: string;
  email?: string | null;
  whatsappNumber?: string | null;
  locale: string;
  variables: Readonly<Record<string, string>>;
  status?: "queued" | "suppressed";
  blockedReason?: string | null;
}>;

export type CampaignEligibilitySummary = Readonly<{
  eligible: number;
  blocked: number;
  byReason: Readonly<Record<string, number>>;
}>;

export type CampaignAudienceSnapshot = Readonly<{
  rows: readonly CampaignRecipientSnapshot[];
  summary: CampaignEligibilitySummary;
}>;

export type CampaignAuditSummary = CampaignEligibilitySummary & Readonly<{action: "campaign.queued" | "campaign.drafted"}>;

export type CampaignQueueResult = Readonly<{campaignId: string; recipientCount: number; disposition: "created" | "existing"}>;
export type CampaignInsertResult = Readonly<{inserted: number; skipped: number}>;
export type CampaignReviewDecision =
  | Readonly<{outcome: "approved"}>
  | Readonly<{outcome: "rejected"; reason: string}>;
export type CampaignReport = Readonly<{
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  blocked: number;
  byReason: Readonly<Record<string, number>>;
}>;

export type CampaignQueueDependencies = Readonly<{
  transaction: <T>(actor: Actor, callback: (store: unknown) => Promise<T>) => Promise<T>;
  findCampaignByIdempotencyKey: (actor: Actor, store: unknown, idempotencyKey: string, segmentId: string) => Promise<Readonly<{campaignId: string; recipientCount: number}> | null>;
  getSavedSegment: (actor: Actor, store: unknown, segmentId: string) => Promise<Readonly<{id: string; ownerProfileId: string; filters: SegmentFilterSet}> | null>;
  /**
   * Renamed from `membersForSegment` in Phase C2: a segment can address
   * prospects since C-6, so a name promising members was going to be read as a
   * guarantee by the next person who needed one.
   */
  audienceForSegment: (actor: Actor, store: unknown, filter: SegmentFilterSet) => Promise<readonly RecipientFacts[]>;
  createCampaign: (actor: Actor, store: unknown, input: CreateCampaignInput) => Promise<CampaignQueueResult>;
  insertRecipients: (actor: Actor, store: unknown, campaignId: string, recipients: readonly CampaignRecipientSnapshot[]) => Promise<CampaignInsertResult>;
  appendAudit: (actor: Actor, store: unknown, campaignId: string, summary: CampaignAuditSummary) => Promise<void>;
}>;

export function resolveCampaignDraft(value: unknown, create: () => string): Readonly<{draftId: string; created: boolean}> {
  const parsed = campaignDraftSchema.safeParse(value);
  return parsed.success ? {draftId: parsed.data, created: false} : {draftId: create(), created: true};
}

export function campaignDraftHref(path: string, searchParams: Readonly<Record<string, string | string[] | undefined>>, draftId: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "campaignDraft" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  params.set("campaignDraft", campaignDraftSchema.parse(draftId));
  return path + "?" + params.toString();
}

export function isEligibleCampaignEmail(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return z.string().email().safeParse(normalized).success ? normalized : null;
}

export type CampaignSnapshotInput = Readonly<{
  channel: CampaignChannel;
  /**
   * The ordered `variables` array of the `whatsapp_templates` row the campaign
   * sends. Empty for email, whose body is built from the source template rather
   * than from per-recipient parameters.
   */
  templateVariables: readonly string[];
  /** `campaigns.variables_template`: one literal-or-token per template variable. */
  variablesTemplate: Readonly<Record<string, string>>;
}>;

/**
 * The one snapshot builder, for both writers.
 *
 * The email arm keeps the shape it has had since M2 (`displayName`, and
 * `renewalDate` when there is one) so `campaign_generic` and the hourly runner
 * are untouched. The WhatsApp arm resolves every parameter the template
 * declares, and a parameter that will not resolve blocks the recipient as
 * `missing_variable` — see `resolveRecipientVariables` for why that is a gate.
 */
export function snapshotAudience(
  audience: readonly RecipientFacts[],
  input: CampaignSnapshotInput,
): CampaignAudienceSnapshot {
  const rows: CampaignRecipientSnapshot[] = [];
  const byReason: Record<string, number> = {};
  let eligible = 0;
  let blocked = 0;

  for (const facts of audience) {
    const identity = facts.kind === "member" ? {profileId: facts.id} : {contactId: facts.id};
    // A row carries exactly the contact point its channel sends to. That is
    // what lets `insertRecipients` recognise a template send and refuse an
    // empty body parameter without being told the channel.
    const email = input.channel === "email" ? campaignEmailFor(facts) : null;
    const whatsappNumber = input.channel === "whatsapp" ? campaignNumberFor(facts) : null;
    const base = {...identity, email, locale: facts.locale};

    const category = classifyRecipient(facts, input.channel);
    if (category !== "eligible") {
      rows.push({...base, whatsappNumber: null, variables: {}, status: "suppressed", blockedReason: category});
      byReason[category] = (byReason[category] ?? 0) + 1;
      blocked += 1;
      continue;
    }

    const resolved = input.channel === "whatsapp"
      ? resolveRecipientVariables({variables: input.templateVariables}, input.variablesTemplate, facts)
      : {ok: true, variables: emailVariables(facts)} as const;
    if (!resolved.ok) {
      rows.push({...base, whatsappNumber: null, variables: {}, status: "suppressed", blockedReason: "missing_variable"});
      byReason.missing_variable = (byReason.missing_variable ?? 0) + 1;
      blocked += 1;
      continue;
    }

    rows.push({...base, whatsappNumber, variables: resolved.variables, status: "queued", blockedReason: null});
    eligible += 1;
  }

  return {rows, summary: {eligible, blocked, byReason}};
}

function emailVariables(facts: RecipientFacts): Record<string, string> {
  const renewalDate = facts.renewalAt?.toISOString().slice(0, 10) ?? null;
  return {displayName: facts.displayName, ...(renewalDate ? {renewalDate} : {})};
}

export async function queueCampaign(actor: Actor, input: unknown, dependencies: CampaignQueueDependencies = campaignsRepository): Promise<CampaignQueueResult> {
  requireAdmin(actor);
  const parsed = queueCampaignSchema.parse(input);
  return dependencies.transaction(actor, async (store) => {
    const segment = await dependencies.getSavedSegment(actor, store, parsed.segmentId);
    if (!segment) throw new Error("Campaign segment was not found");
    const existing = await dependencies.findCampaignByIdempotencyKey(actor, store, parsed.idempotencyKey, segment.id);
    if (existing) return {...existing, disposition: "existing"};
    const audience = await dependencies.audienceForSegment(actor, store, segment.filters);
    // S-17. The shortcut stays email-only and immediate; `/admin/campaigns` is
    // the reviewed path and the only one that can name a WhatsApp template.
    const snapshot = snapshotAudience(audience, {channel: "email", templateVariables: [], variablesTemplate: {}});
    const campaign = await dependencies.createCampaign(actor, store, createCampaignSchema.parse({...parsed, channel: "email", status: "queued"}));
    if (campaign.disposition === "existing") return campaign;
    await dependencies.insertRecipients(actor, store, campaign.campaignId, snapshot.rows);
    await dependencies.appendAudit(actor, store, campaign.campaignId, {action: "campaign.queued", ...snapshot.summary});
    // The count staff see is the count that will be SENT, not the number of
    // rows written: the snapshot now also holds everyone the campaign could not
    // reach, and reporting that total would overstate the blast.
    return {...campaign, recipientCount: snapshot.summary.eligible};
  });
}
