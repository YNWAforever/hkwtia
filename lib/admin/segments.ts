import "server-only";

import {segmentPreviewSchema, segmentSaveSchema, type SegmentFilterSet, type SegmentPagination, type SegmentPreviewInput, type SegmentSaveInput} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {segmentsRepository, type SavedSegmentRecord} from "@/lib/db/repos/segments";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type SegmentMember = Readonly<{
  profileId: string;
  displayName: string;
  email: string | null;
  companyName: string | null;
  planCode: string | null;
  membershipStatus: string | null;
  renewalAt: string | null;
  score: number | null;
}>;

export type SegmentPreview = Readonly<{total: number; items: readonly SegmentMember[]; nextCursor: string | null}>;
export type SegmentReader = Readonly<{preview: (actor: AdminActor, filter: SegmentFilterSet, pagination: SegmentPagination) => Promise<SegmentPreview>}>;
export type SegmentWriter = Readonly<{save: (actor: AdminActor, input: SegmentSaveInput) => Promise<SavedSegmentRecord>}>;

export async function previewSegment(actor: Actor, input: unknown, repository: SegmentReader = segmentsRepository): Promise<SegmentPreview> {
  requireAdmin(actor);
  const parsed: SegmentPreviewInput = segmentPreviewSchema.parse(input);
  return repository.preview(actor, parsed.filter, {limit: parsed.limit, cursor: parsed.cursor});
}

export async function saveSegment(actor: Actor, input: unknown, repository: SegmentWriter = segmentsRepository): Promise<SavedSegmentRecord> {
  requireAdmin(actor);
  return repository.save(actor, segmentSaveSchema.parse(input));
}
