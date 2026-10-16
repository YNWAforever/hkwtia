import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type EngagementTimelineItem = Readonly<{id: string; type: string; points: number; occurredAt: string}>;
export type EmailHistoryItem = Readonly<{id: string; template: string; subject: string; status: string; createdAt: string}>;
export type RegistrationHistoryItem = Readonly<{eventId: string; title: string; startsAt: string; status: string; checkedInAt: string | null}>;
export type MemberPurchaseItem = Readonly<{id: string; eventId: string; titleEn: string; titleZh: string | null; status: string; amountHkdCents: number; paidAt: string | null; refundedAt: string | null; refundReason: string | null; createdAt: string; seats: readonly Readonly<{id: string; attendeeName: string; checkedInAt: string | null}>[]}>;
export type MemberNoteItem = Readonly<{id: string; authorProfileId: string; authorName?: string | null; body: string; replacesNoteId: string | null; createdAt: string}>;
export type JourneyHistoryItem = Readonly<{id: string; journey: string; step: string; status: string; scheduledAt: string; attemptCount: number; errorCode: string | null}>;
export type WhatsappHistoryItem = Readonly<{id: string; template: string; status: string; locale: string; classification: string; attemptCount: number; errorCode: string | null; createdAt: string}>;
export type SuppressionHistoryItem = Readonly<{id: string; channel: string; classification: string; reasonCode: string | null; createdAt: string}>;

export type Member360 = Readonly<{
  profile: {id: string; displayName: string; email: string | null; phone: string | null; role: string};
  companies: readonly {id: string; name: string; role: string}[];
  membership: {id: string; companyId: string | null; planCode: string; status: string; renewalAt: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null} | null;
  memberships: readonly {id: string; companyId: string | null; planCode: string; status: string; renewalAt: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null}[];
  engagement: {score: number | null; trend: number | null; events: readonly EngagementTimelineItem[]};
  emails: readonly EmailHistoryItem[];
  events: readonly RegistrationHistoryItem[];
  purchases: readonly MemberPurchaseItem[];
  notes: readonly MemberNoteItem[];
  journeys: readonly JourneyHistoryItem[];
  whatsapp: readonly WhatsappHistoryItem[];
  suppressions: readonly SuppressionHistoryItem[];
}>;

export type Member360Reader = Readonly<{get360: (actor: AdminActor, profileId: string) => Promise<Member360 | null>}>;

const profileIdSchema = z.string().min(1);

export class Member360NotFoundError extends Error {
  constructor() { super("MEMBER_NOT_FOUND"); this.name = "Member360NotFoundError"; }
}

export async function getMember360(actor: Actor, profileId: unknown, reader: Member360Reader = adminMembersRepository): Promise<Member360> {
  requireAdmin(actor);
  const view = await reader.get360(actor, profileIdSchema.parse(profileId));
  if (!view) throw new Member360NotFoundError();
  return view;
}