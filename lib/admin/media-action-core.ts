import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type MediaActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type MediaFormOptions = Readonly<{
  successMessage: string;
  urlInvalidMessage: string;
  urlConflictMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<unknown>;
}>;

/** Explicit allowlist: only these are ever echoed back to the browser. */
const preservedFields = ["url", "altEn", "altZh"] as const;

/**
 * The two url failures get their own messages. "Check the fields" does not tell
 * a staff member that the site only renders its own images, which is the single
 * thing they most need to know the first time they use this form.
 */
function urlMessage(error: z.ZodError, options: MediaFormOptions): string | null {
  const issue = error.issues.find((entry) => entry.path[0] === "url");
  if (!issue) return null;
  if (issue.message === "MEDIA_URL_TAKEN") return options.urlConflictMessage;
  if (issue.message === "MEDIA_URL_INVALID") return options.urlInvalidMessage;
  return null;
}

export async function runMediaFormAction(
  _state: MediaActionState,
  formData: FormData,
  options: MediaFormOptions,
): Promise<MediaActionState> {
  const values = Object.fromEntries(
    preservedFields.map((name) => [name, String(formData.get(name) ?? "")]),
  );
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      const message = urlMessage(error, options) ?? options.validationMessage;
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string"
          ? [[issue.path[0], issue.path[0] === "url" ? message : options.validationMessage]]
          : []));
      return {status: "error", message, fieldErrors, values};
    }
    return {status: "error", message: options.errorMessage, values};
  }
}
