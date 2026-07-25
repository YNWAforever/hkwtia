import "server-only";

import {
  reconcileRenewalEnrollments,
  type JobSummary,
  type LifecycleEnrollmentDependencies,
} from "@/lib/automation/enrollment";
import type {Actor} from "@/lib/membership/lifecycle";

export type {JobSummary} from "@/lib/automation/enrollment";

export async function runRenewalReconciliation(
  actor: Actor,
  now: Date,
  dependencies?: LifecycleEnrollmentDependencies,
): Promise<JobSummary> {
  return reconcileRenewalEnrollments(actor, now, dependencies);
}
