import "server-only";

import {z} from "zod";

import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/actor";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export const queueCampaignSchema = z.object({
  segmentId: z.string().uuid(),
  template: z.string().trim().min(1).max(100),
  localeStrategy: z.literal("profile").default("profile"),
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict();

export type QueueCampaignInput = z.infer<typeof queueCampaignSchema>;
export type CampaignQueueRecipient = Readonly<{profileId: string; email: string; locale: string; variables: Readonly<Record<string, string | null>>}>;
export type CampaignQueueMember = Readonly<{profileId: string; displayName: string; email: string | null; locale: string; consentMarketing: boolean; suppressed: boolean; renewalAt: string | null}>;
export type CampaignQueueResult = Readonly<{campaignId: string; recipientCount: number; disposition: "created" | "existing"}>;
export type CampaignQueueDependencies = Readonly<{
  transaction: <T>(callback: (store: unknown) => Promise<T>) => Promise<T>;
  findCampaignByIdempotencyKey: (store: unknown, idempotencyKey: string) => Promise<Readonly<{campaignId: string; recipientCount: number}> | null>;
  getSavedSegment: (store: unknown, actor: AdminActor, segmentId: string) => Promise<Readonly<{id: string; ownerProfileId: string; filters: SegmentFilterSet}> | null>;
  membersForSegment: (store: unknown, filter: SegmentFilterSet) => Promise<readonly CampaignQueueMember[]>;
  createCampaign: (store: unknown, actor: AdminActor, input: QueueCampaignInput) => Promise<CampaignQueueResult>;
  insertRecipients: (store: unknown, campaignId: string, recipients: readonly CampaignQueueRecipient[]) => Promise<void>;
  appendAudit: (store: unknown, actor: AdminActor, campaignId: string, recipientCount: number) => Promise<void>;
}>;

function snapshotRecipient(member: CampaignQueueMember): CampaignQueueRecipient | null {
  if (!member.email || !member.consentMarketing || member.suppressed) return null;
  return {
    profileId: member.profileId,
    email: member.email,
    locale: member.locale,
    variables: {displayName: member.displayName, renewalDate: member.renewalAt},
  };
}

export async function queueCampaign(actor: Actor, input: unknown, dependencies: CampaignQueueDependencies = campaignsRepository): Promise<CampaignQueueResult> {
  requireAdmin(actor);
  const parsed = queueCampaignSchema.parse(input);
  return dependencies.transaction(async (store) => {
    const existing = await dependencies.findCampaignByIdempotencyKey(store, parsed.idempotencyKey);
    if (existing) return {...existing, disposition: "existing"};

    const segment = await dependencies.getSavedSegment(store, actor, parsed.segmentId);
    if (!segment) throw new Error("Campaign segment was not found");
    const recipients = (await dependencies.membersForSegment(store, segment.filters)).flatMap((member) => {
      const recipient = snapshotRecipient(member);
      return recipient ? [recipient] : [];
    });
    const campaign = await dependencies.createCampaign(store, actor, parsed);
    if (campaign.disposition === "existing") return campaign;

    await dependencies.insertRecipients(store, campaign.campaignId, recipients);
    await dependencies.appendAudit(store, actor, campaign.campaignId, recipients.length);
    return {...campaign, recipientCount: recipients.length};
  });
}
