import type {EventStatus, EventVisibility} from "@/lib/db/schema-core";

/**
 * D-12: the booleans every existing reader uses, derived from the enums on
 * each write. `members_only` and `invite_only` both hide an event from the
 * public site, so both map to `memberOnly: true`; only `status` decides
 * `published`, so a `pending_review` row never leaks through a reader that
 * still filters on the boolean.
 */
export function derivedEventFlags(input: Readonly<{status: EventStatus; visibility: EventVisibility}>): Readonly<{published: boolean; memberOnly: boolean}> {
  return {published: input.status === "published", memberOnly: input.visibility !== "public"};
}

// The review loop (plan B-1): a member drafts, submits, staff approve or
// reject, a rejected event may be revised and resubmitted, and a published
// event may be cancelled or pulled back for review. Nothing skips review and
// nothing leaves `cancelled`; each row also stays where it is.
const transitions: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  draft: ["draft", "pending_review"],
  pending_review: ["pending_review", "published", "rejected", "draft"],
  published: ["published", "cancelled", "pending_review"],
  rejected: ["rejected", "pending_review", "draft"],
  cancelled: ["cancelled"],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return transitions[from].includes(to);
}

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Calendar quarter containing `at`, in Asia/Hong_Kong (fixed UTC+8, no DST),
 * as a half-open `[start, end)` pair of instants. Backs the S-4 quota count.
 */
export function hongKongQuarterBounds(at: Date): Readonly<{start: Date; end: Date}> {
  const local = new Date(at.getTime() + HONG_KONG_OFFSET_MS);
  const year = local.getUTCFullYear();
  const quarterStartMonth = Math.floor(local.getUTCMonth() / 3) * 3;
  return {
    start: new Date(Date.UTC(year, quarterStartMonth, 1) - HONG_KONG_OFFSET_MS),
    end: new Date(Date.UTC(year, quarterStartMonth + 3, 1) - HONG_KONG_OFFSET_MS),
  };
}
