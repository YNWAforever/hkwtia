import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type PageCopyActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
}>;

type PageCopyFormOptions = Readonly<{
  successMessage: string;
  unchangedMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<Readonly<{updated: number; cleared: number}>>;
}>;

/**
 * Unlike the news form, submitted values are not echoed back. The form has
 * hundreds of fields across two locales; the inputs are uncontrolled and never
 * remounted, so the browser already holds exactly what the editor typed. Round
 * -tripping all of it would cost far more than it saves, and a stale echo is
 * the one way this form could lose work.
 */
export async function runPageCopyFormAction(
  _state: PageCopyActionState,
  formData: FormData,
  options: PageCopyFormOptions,
): Promise<PageCopyActionState> {
  try {
    const result = await options.mutate(formData);
    const changed = result.updated + result.cleared;
    return {
      status: "success",
      message: changed ? options.successMessage : options.unchangedMessage,
    };
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      // Issue paths carry the offending key path, so the editor can be pointed
      // at the field rather than told the page failed.
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string" ? [[issue.path[0], options.validationMessage]] : []));
      return {status: "error", message: options.validationMessage, fieldErrors};
    }
    return {status: "error", message: options.errorMessage};
  }
}
