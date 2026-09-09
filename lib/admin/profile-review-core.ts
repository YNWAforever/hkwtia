import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {companyProfilesRepository, type CompanyProfileReviewDecision, type CompanyProfileRow} from "@/lib/db/repos/company-profiles";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has
 * no authorization at all. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/profile-review-actions.ts` are dispatchable, and each resolves the
 * actor from the session itself.
 *
 * `requireAdmin` runs here as well as in `companyProfilesRepository.review`:
 * the repository is the authorization gate, but refusing before the uuid/reason
 * parse keeps a non-admin from learning which ids or reasons are well-formed.
 *
 * This mirrors `lib/admin/event-review-core.ts` (Phase B1, B-3) deliberately:
 * the two review queues are the same workflow over different rows, and a
 * reviewer reading one should not have to relearn the other.
 */
export type CompanyProfileReviewer = Readonly<{
  review: (
    actor: Actor,
    companyId: string,
    decision: CompanyProfileReviewDecision,
  ) => Promise<Pick<CompanyProfileRow, "id" | "public_profile_status" | "slug">>;
}>;

const companyIdSchema = z.string().uuid();
const rejectionReasonSchema = z.string().trim().min(1).max(1_000);

export async function approveCompanyProfile(actor: Actor, companyId: unknown, deps: CompanyProfileReviewer = companyProfilesRepository) {
  requireAdmin(actor);
  return deps.review(actor, companyIdSchema.parse(companyId), {decision: "approve"});
}

export async function rejectCompanyProfile(actor: Actor, companyId: unknown, reason: unknown, deps: CompanyProfileReviewer = companyProfilesRepository) {
  requireAdmin(actor);
  return deps.review(actor, companyIdSchema.parse(companyId), {decision: "reject", reason: rejectionReasonSchema.parse(reason)});
}
