import type {Event} from "@/lib/db/server-schema";

type PhaseB1EventColumns = Pick<
  Event,
  | "organiserCompanyId"
  | "submittedByProfileId"
  | "submittedAt"
  | "status"
  | "visibility"
  | "format"
  | "onlineUrl"
  | "registrationMode"
  | "externalRegistrationUrl"
  | "tags"
  | "publishedAt"
  | "reviewedAt"
  | "reviewedByProfileId"
  | "rejectionReason"
>;

/**
 * Legacy-row fixtures only: derives the enums the way migration 0027 does.
 * Never import from repository tests that exercise status/visibility
 * directly.
 *
 * The Phase B1 columns for an in-memory `events` row, derived from the legacy
 * booleans the way migration 0027 and the repository do (programme D-12): a
 * fixture that says `published: false` must not also claim `status:
 * "published"`, or a reader moved to the enums would see a different row than
 * one still on the booleans.
 */
export function legacyDerivedEventColumns(row: Pick<Event, "published" | "memberOnly" | "createdAt">): PhaseB1EventColumns {
  return {
    organiserCompanyId: null,
    submittedByProfileId: null,
    submittedAt: null,
    status: row.published ? "published" : "draft",
    visibility: row.memberOnly ? "members_only" : "public",
    format: "in_person",
    onlineUrl: null,
    registrationMode: "rsvp",
    externalRegistrationUrl: null,
    tags: [],
    publishedAt: row.published ? row.createdAt : null,
    reviewedAt: null,
    reviewedByProfileId: null,
    rejectionReason: null,
  };
}
