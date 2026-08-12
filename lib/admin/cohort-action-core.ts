import {z} from "zod";

import {cohortFormFields} from "@/lib/admin/cohort-form-input";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type CohortActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type CohortFormOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  slugConflictMessage: string;
  endBeforeStartMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<unknown>;
}>;

/**
 * Two validation failures get their own message, because "check the fields"
 * does not tell staff what to change: a slug already in use, and an end date
 * before the start date.
 */
function messageFor(
  error: z.ZodError,
  options: CohortFormOptions,
): string {
  if (error.issues.some((issue) => issue.message === "COHORT_SLUG_TAKEN")) {
    return options.slugConflictMessage;
  }
  if (error.issues.some((issue) => issue.message === "COHORT_END_BEFORE_START")) {
    return options.endBeforeStartMessage;
  }
  return options.validationMessage;
}

export async function runCohortFormAction(
  _state: CohortActionState,
  formData: FormData,
  options: CohortFormOptions,
): Promise<CohortActionState> {
  // Explicit allowlist: only these are ever echoed back to the browser.
  const values = Object.fromEntries(
    cohortFormFields.map((name) => [name, String(formData.get(name) ?? "")]),
  );
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      const message = messageFor(error, options);
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string" ? [[issue.path[0], message]] : []));
      return {status: "error", message, fieldErrors, values};
    }
    return {status: "error", message: options.errorMessage, values};
  }
}
