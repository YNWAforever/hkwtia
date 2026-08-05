import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type NewsActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type NewsFormOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  slugConflictMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<unknown>;
}>;

/** Explicit allowlist: only these are ever echoed back to the browser. */
const preservedFields = [
  "slug", "titleEn", "titleZh", "bodyMdx", "author", "published",
] as const;

export async function runNewsFormAction(
  _state: NewsActionState,
  formData: FormData,
  options: NewsFormOptions,
): Promise<NewsActionState> {
  const values = Object.fromEntries(
    preservedFields.map((name) => [name, String(formData.get(name) ?? "")]),
  );
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      // A duplicate slug is the one validation failure with its own message,
      // because "check the fields" does not tell an author what to change.
      const conflict = error.issues.some((issue) =>
        issue.path[0] === "slug" && issue.message === "NEWS_SLUG_TAKEN");
      const message = conflict ? options.slugConflictMessage : options.validationMessage;
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string" ? [[issue.path[0], message]] : []));
      return {status: "error", message, fieldErrors, values};
    }
    return {status: "error", message: options.errorMessage, values};
  }
}
