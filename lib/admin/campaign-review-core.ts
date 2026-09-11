import "server-only";

import {z} from "zod";

import type {CampaignRecord, CampaignReadDependencies, CampaignReviewDecision} from "@/lib/admin/campaigns";
import {parseHongKongDateTimeLocal} from "@/lib/admin/event-form-input";
import {requireAdmin} from "@/lib/auth/authorize";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-5. The actor-taking core of `/admin/campaigns/[id]`.
 *
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has no
 * authorization at all. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/campaign-review-actions.ts` are dispatchable, and each resolves the
 * actor from the session itself.
 *
 * Each function opens ONE transaction and performs the whole decision inside it.
 * That is a caller contract the repository states rather than enforces
 * (`submitForReview`/`recordReview`/`schedule` each write a row and an
 * `audit_events` row against the caller's `store`), and a decision whose audit
 * row failed separately would be a two-person control with a one-person record.
 */
export type CampaignReviewDependencies = CampaignReadDependencies & Readonly<{
  submitForReview: (actor: Actor, store: unknown, campaignId: string) => Promise<void>;
  recordReview: (actor: Actor, store: unknown, campaignId: string, decision: CampaignReviewDecision) => Promise<void>;
  schedule: (actor: Actor, store: unknown, campaignId: string, scheduledAt: Date) => Promise<void>;
  queueApproved: (actor: Actor, store: unknown, campaignId: string) => Promise<void>;
}>;

const campaignIdSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(1).max(500);
/** A `datetime-local` value, or nothing. Absent and empty are the same answer here. */
const scheduleInputSchema = z.string().trim().max(40).nullable().transform((value) => (value === null || value === "" ? null : value));

/**
 * A `<input type="datetime-local">` submits a wall-clock string with no zone,
 * so reading it as UTC would schedule a Hong Kong blast eight hours early.
 * `parseHongKongDateTimeLocal` is the one place in the tree that knows the
 * convention (the events admin has used it since M2); a second reading of the
 * same input format is how two screens come to disagree about what "09:00"
 * means.
 */
export function parseScheduledAt(value: string, now: Date): Date {
  let parsed: Date;
  try {
    parsed = parseHongKongDateTimeLocal(value);
  } catch {
    throw new Error("INVALID_SCHEDULED_AT");
  }
  // A schedule in the past is accepted by the column and then promoted on the
  // very next tick, which is a blast sent immediately by an admin who meant to
  // send it next week.
  if (parsed.getTime() <= now.getTime()) throw new Error("SCHEDULED_AT_IN_THE_PAST");
  return parsed;
}

export async function submitCampaignForReview(
  actor: Actor,
  campaignId: unknown,
  dependencies: CampaignReviewDependencies = campaignsRepository,
): Promise<void> {
  requireAdmin(actor);
  const parsedCampaignId = campaignIdSchema.parse(campaignId);
  await dependencies.transaction(actor, (store) => dependencies.submitForReview(actor, store, parsedCampaignId));
}

export async function rejectCampaign(
  actor: Actor,
  campaignId: unknown,
  reason: unknown,
  dependencies: CampaignReviewDependencies = campaignsRepository,
): Promise<void> {
  requireAdmin(actor);
  const parsedCampaignId = campaignIdSchema.parse(campaignId);
  const parsedReason = reasonSchema.parse(reason);
  await dependencies.transaction(actor, (store) => dependencies.recordReview(actor, store, parsedCampaignId, {
    outcome: "rejected",
    reason: parsedReason,
  }));
}

/**
 * Approve, then act on the approval, in one transaction — and what "act on it"
 * means is the campaign's channel.
 *
 * WhatsApp is scheduled: Task 10's ten-minute runner promotes `scheduled →
 * queued` when the time comes. Email is queued outright, because nothing
 * promotes a `scheduled` email campaign yet and a row left in `scheduled`
 * produces no error anywhere — the list simply reads "Scheduled" forever, which
 * is silent, permanent, and indistinguishable from waiting.
 *
 * The refusal below is defence in depth: the screen does not render a send-time
 * field for an email campaign at all. But every export of the action module in
 * front of this is a published HTTP endpoint, so the rule has to hold for a
 * caller that never saw the form.
 */
export async function approveCampaign(
  actor: Actor,
  campaignId: unknown,
  scheduledAt: unknown,
  dependencies: CampaignReviewDependencies = campaignsRepository,
  now: Date = new Date(),
): Promise<void> {
  requireAdmin(actor);
  const parsedCampaignId = campaignIdSchema.parse(campaignId);
  const requested = scheduleInputSchema.parse(scheduledAt ?? null);
  await dependencies.transaction(actor, async (store) => {
    const campaign: CampaignRecord | null = await dependencies.campaignFor(actor, store, parsedCampaignId);
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.channel === "email") {
      if (requested !== null) throw new Error("EMAIL_CAMPAIGN_CANNOT_BE_SCHEDULED");
      await dependencies.recordReview(actor, store, parsedCampaignId, {outcome: "approved"});
      await dependencies.queueApproved(actor, store, parsedCampaignId);
      return;
    }
    if (requested === null) throw new Error("SCHEDULED_AT_REQUIRED");
    // Parsed before the approval is recorded, so a malformed time leaves the
    // campaign in `review` rather than approved-but-unscheduled — a state whose
    // only exit is a second admin noticing.
    const when = parseScheduledAt(requested, now);
    await dependencies.recordReview(actor, store, parsedCampaignId, {outcome: "approved"});
    await dependencies.schedule(actor, store, parsedCampaignId, when);
  });
}
