"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {notFound} from "next/navigation";

import {runCohortFormAction, type CohortActionState} from "@/lib/admin/cohort-action-core";
import {cohortFormInput} from "@/lib/admin/cohort-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {cohortRepository} from "@/lib/db/repos/cohorts";

// Only the admin path is revalidated. The public surface that lists cohorts —
// /launchpad — is force-dynamic, so it re-reads on every request and has no
// cache entry to invalidate.

const canonicalPathSchema = z.union([z.literal("/admin/cohorts"), z.literal("/zh/admin/cohorts")]);
const moveSchema = z.object({
  applicationId: z.string().uuid(),
  stage: z.enum(["applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected"]),
  notes: z.string().trim().max(4_000).transform((value) => value || undefined),
}).strict();

export type CohortMoveActionState = Readonly<{status: "idle" | "success" | "invalid" | "forbidden" | "error"}>;

function actionInput(formData: FormData) {
  return moveSchema.safeParse({
    applicationId: formData.get("applicationId"),
    stage: formData.get("stage"),
    notes: formData.get("notes"),
  });
}

export type CohortFormActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  slugConflictMessage: string;
  endBeforeStartMessage: string;
  errorMessage: string;
}>;

export async function createCohortAction(
  path: string,
  messages: CohortFormActionMessages,
  state: CohortActionState,
  formData: FormData,
): Promise<CohortActionState> {
  try {
    return await runCohortFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      await cohortRepository.createCohort(actor, cohortFormInput(data));
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateCohortAction(
  cohortId: string,
  path: string,
  messages: CohortFormActionMessages,
  state: CohortActionState,
  formData: FormData,
): Promise<CohortActionState> {
  try {
    return await runCohortFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      const updated = await cohortRepository.updateCohort(actor, cohortId, cohortFormInput(data));
      if (!updated) throw new Error("COHORT_NOT_FOUND");
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

/** Staff mutation boundary; the repository owns transition validation, audit, and graduate projection. */
export async function moveCohortApplicationAction(path: string, formData: FormData): Promise<CohortMoveActionState> {
  const parsedPath = canonicalPathSchema.safeParse(path);
  const parsedInput = actionInput(formData);
  if (!parsedPath.success || !parsedInput.success) return {status: "invalid"};

  try {
    const actor = await requireAdminActor();
    const moved = await cohortRepository.moveApplication(
      actor,
      parsedInput.data.applicationId,
      parsedInput.data.stage,
      parsedInput.data.notes,
    );
    if (!moved) return {status: "invalid"};
    revalidatePath(parsedPath.data);
    return {status: "success"};
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) return {status: "forbidden"};
    if (error instanceof Error && (error.message === "INVALID_COHORT_STAGE_TRANSITION" || error.message === "COHORT_APPLICATION_CONCURRENT_UPDATE")) return {status: "invalid"};
    return {status: "error"};
  }
}
