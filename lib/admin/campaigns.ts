import "server-only";

import {z} from "zod";

import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/actor";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import type {Actor} from "@/lib/membership/lifecycle";

export const queueCampaignSchema = z.object({
  segmentId: z.string().uuid(),
  template: z.string().trim().min(1).max(100),
  localeStrategy: z.literal("profile").default("profile"),
  idempotencyKey: z.string().uuid(),
}).strict();
export const campaignDraftSchema = z.string().uuid();

export type QueueCampaignInput = z.infer<typeof queueCampaignSchema>;
export type CampaignQueueRecipient = Readonly<{profileId: string; email: string; locale: string; variables: Readonly<Record<string, string>>}>;
export type CampaignQueueMember = Readonly<{profileId: string; displayName: string; email: string | null; locale: string; consentMarketing: boolean; suppressed: boolean; renewalAt: string | null}>;
export type CampaignQueueResult = Readonly<{campaignId: string; recipientCount: number; disposition: "created" | "existing"}>;
export type CampaignQueueDependencies = Readonly<{
  transaction: <T>(actor: Actor, callback: (store: unknown) => Promise<T>) => Promise<T>;
  findCampaignByIdempotencyKey: (actor: Actor, store: unknown, idempotencyKey: string, segmentId: string) => Promise<Readonly<{campaignId: string; recipientCount: number}> | null>;
  getSavedSegment: (actor: Actor, store: unknown, segmentId: string) => Promise<Readonly<{id: string; ownerProfileId: string; filters: SegmentFilterSet}> | null>;
  membersForSegment: (actor: Actor, store: unknown, filter: SegmentFilterSet) => Promise<readonly CampaignQueueMember[]>;
  createCampaign: (actor: Actor, store: unknown, input: QueueCampaignInput) => Promise<CampaignQueueResult>;
  insertRecipients: (actor: Actor, store: unknown, campaignId: string, recipients: readonly CampaignQueueRecipient[]) => Promise<void>;
  appendAudit: (actor: Actor, store: unknown, campaignId: string, recipientCount: number) => Promise<void>;
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

function snapshotRecipient(member: CampaignQueueMember): CampaignQueueRecipient | null {
  const email = isEligibleCampaignEmail(member.email);
  if (!email || !member.consentMarketing || member.suppressed) return null;
  return {
    profileId: member.profileId,
    email,
    locale: member.locale,
    variables: {displayName: member.displayName, ...(member.renewalAt ? {renewalDate: member.renewalAt} : {})},
  };
}

export async function queueCampaign(actor: Actor, input: unknown, dependencies: CampaignQueueDependencies = campaignsRepository): Promise<CampaignQueueResult> {
  requireAdmin(actor);
  const parsed = queueCampaignSchema.parse(input);
  return dependencies.transaction(actor, async (store) => {
    const segment = await dependencies.getSavedSegment(actor, store, parsed.segmentId);
    if (!segment) throw new Error("Campaign segment was not found");
    const existing = await dependencies.findCampaignByIdempotencyKey(actor, store, parsed.idempotencyKey, segment.id);
    if (existing) return {...existing, disposition: "existing"};
    const recipients = (await dependencies.membersForSegment(actor, store, segment.filters)).flatMap((member) => {
      const recipient = snapshotRecipient(member);
      return recipient ? [recipient] : [];
    });
    const campaign = await dependencies.createCampaign(actor, store, parsed);
    if (campaign.disposition === "existing") return campaign;
    await dependencies.insertRecipients(actor, store, campaign.campaignId, recipients);
    await dependencies.appendAudit(actor, store, campaign.campaignId, recipients.length);
    return {...campaign, recipientCount: recipients.length};
  });
}
