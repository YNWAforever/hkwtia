import "server-only";

import {
  reconcileRenewalEnrollments,
  type JobSummary,
  type RenewalEnrollmentDependencies,
} from "@/lib/automation/enrollment";
import type {AutomationRepositoryActor} from "@/lib/auth/automation-actor";

export type {JobSummary} from "@/lib/automation/enrollment";

export async function runRenewalReconciliation(
  actor: AutomationRepositoryActor,
  now: Date,
  dependencies?: RenewalEnrollmentDependencies,
): Promise<JobSummary> {
  return reconcileRenewalEnrollments(actor, now, dependencies);
}
