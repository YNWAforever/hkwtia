import "server-only";

import {cohortRepository, type CohortRepository} from "@/lib/db/repos/cohorts";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Actor-taking core, deliberately outside the `"use server"` module: that
 * directive publishes every export as an HTTP endpoint, and one whose caller
 * supplies the actor performs no authorization at all.
 */
export type MemberCohortRepository = Pick<CohortRepository, "createApplication">;

export async function applyToCohort(
  actor: Actor,
  cohortId: string,
  input: unknown,
  repository: MemberCohortRepository = cohortRepository,
) {
  return repository.createApplication(actor, cohortId, input);
}
