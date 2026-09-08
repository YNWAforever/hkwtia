import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {eventsRepository, type EventReviewDecision, type MemberEventRow} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has
 * no authorization at all. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/event-review-actions.ts` are dispatchable, and each resolves the
 * actor from the session itself.
 *
 * `requireAdmin` runs here as well as in `reviewEvent`: the repository is the
 * authorization gate, but refusing before the uuid/reason parse keeps a
 * non-admin from learning which ids or reasons are well-formed.
 */
export type EventReviewer = Readonly<{
  review: (actor: Actor, eventId: string, decision: EventReviewDecision) => Promise<Pick<MemberEventRow, "id" | "status">>;
}>;

const eventIdSchema = z.string().uuid();
const rejectionReasonSchema = z.string().trim().min(1).max(1_000);

export async function approveMemberEvent(actor: Actor, eventId: unknown, deps: EventReviewer = eventsRepository) {
  requireAdmin(actor);
  return deps.review(actor, eventIdSchema.parse(eventId), {decision: "approve"});
}

export async function rejectMemberEvent(actor: Actor, eventId: unknown, reason: unknown, deps: EventReviewer = eventsRepository) {
  requireAdmin(actor);
  return deps.review(actor, eventIdSchema.parse(eventId), {decision: "reject", reason: rejectionReasonSchema.parse(reason)});
}
