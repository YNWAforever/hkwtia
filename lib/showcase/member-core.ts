import "server-only";

import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Actor-taking cores, deliberately outside any `"use server"` module. That
 * directive publishes every export as an HTTP endpoint, and an endpoint whose
 * caller supplies the actor performs no authorization at all — the repository
 * would be checking an object the attacker sent.
 */
export type MemberShowcaseRepository = Pick<ShowcaseRepository, "upsertDraft" | "submitForReview">;

export async function saveShowcaseDraft(
  actor: Actor,
  companyId: string,
  rawInput: unknown,
  repository: MemberShowcaseRepository = showcaseRepository,
) {
  return repository.upsertDraft(actor, companyId, rawInput, "draft");
}

export async function submitShowcaseListing(
  actor: Actor,
  companyId: string,
  rawInput: unknown,
  repository: MemberShowcaseRepository = showcaseRepository,
) {
  return repository.submitForReview(actor, companyId, rawInput);
}
