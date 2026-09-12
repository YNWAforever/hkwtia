import "server-only";

import {segmentPreviewSchema, segmentSaveSchema, type SegmentFilterSet, type SegmentPagination, type SegmentPreviewInput, type SegmentSaveInput} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {segmentsRepository, type SavedSegmentRecord} from "@/lib/db/repos/segments";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

/**
 * C-6 / S-10. One row shape for both arms of the audience, discriminated by
 * `kind` rather than widened into a member row with optional contact columns.
 * The discriminator is what every downstream reader keys on — the CSV, the
 * preview table and (Phase C2 Task 8) the eligibility classifier, which has to
 * know which suppression source applies: a member's opt-out lives in
 * `message_suppressions`, a prospect's in `contacts.whatsapp_opted_out_at`.
 * A single `profileId` field could not tell them apart, and a classifier that
 * reads the wrong source is a campaign that reaches someone who said STOP.
 *
 * `id` is a profile id for a member and a contact id for a contact. They are
 * never interchangeable, which is why the field is deliberately not named
 * `profileId` any more.
 */
export type SegmentAudienceRow = Readonly<{
  kind: "member" | "contact";
  id: string;
  displayName: string;
  email: string | null;
  companyName: string | null;
  planCode: string | null;
  membershipStatus: string | null;
  renewalAt: string | null;
  score: number | null;
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  contactStage: string | null;
  contactSource: string | null;
}>;

export type SegmentPreview = Readonly<{total: number; items: readonly SegmentAudienceRow[]; nextCursor: string | null}>;
/**
 * `now` is the caller's snapshot of the clock, threaded rather than taken per
 * call: `renewalWithinDays` and `lastLoginBeforeDays` are relative windows, and
 * the CSV export pages the same filter several times. Without one snapshot per
 * request the window slides between pages and the export silently skips or
 * repeats people. A campaign's recipient count is stable only because Task 8
 * snapshots it onto `campaign_recipients`; this is the read-side half of that.
 */
export type SegmentReader = Readonly<{preview: (actor: AdminActor, filter: SegmentFilterSet, pagination: SegmentPagination, now?: Date) => Promise<SegmentPreview>}>;
export type SegmentWriter = Readonly<{save: (actor: AdminActor, input: SegmentSaveInput) => Promise<SavedSegmentRecord>}>;

export async function previewSegment(actor: Actor, input: unknown, repository: SegmentReader = segmentsRepository, now?: Date): Promise<SegmentPreview> {
  requireAdmin(actor);
  const parsed: SegmentPreviewInput = segmentPreviewSchema.parse(input);
  return repository.preview(actor, parsed.filter, {limit: parsed.limit, cursor: parsed.cursor}, now);
}

export async function saveSegment(actor: Actor, input: unknown, repository: SegmentWriter = segmentsRepository): Promise<SavedSegmentRecord> {
  requireAdmin(actor);
  return repository.save(actor, segmentSaveSchema.parse(input));
}
