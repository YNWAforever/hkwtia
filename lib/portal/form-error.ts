import "server-only";
import {unstable_rethrow} from "next/navigation";
import {ZodError} from "zod";
import {portalFormFields, type PortalFieldError, type PortalFormField, type PortalFormState} from "@/lib/portal/form-state";

export function portalFormError(error: unknown): PortalFormState {
  unstable_rethrow(error);
  if (error instanceof ZodError) {
    const fieldErrors: Partial<Record<PortalFormField, PortalFieldError>> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string" || !(portalFormFields as readonly string[]).includes(field)) continue;
      const code = issue.message === "WHATSAPP_NUMBER_REQUIRED" ? "required" : issue.message === "INVALID_WHATSAPP_NUMBER" ? "invalid_number" : "invalid";
      fieldErrors[field as PortalFormField] ??= code;
    }
    return {status: "validation_error", fieldErrors};
  }
  if (error instanceof Error && ["FORBIDDEN", "MEMBERSHIP_INACTIVE", "PROFILE_NOT_FOUND", "COMPANY_NOT_FOUND"].includes(error.message)) return {status: "forbidden"};
  if (error instanceof Error && error.message === "CONFLICT") return {status: "conflict"};
  console.error("PORTAL_FORM_SAVE_UNAVAILABLE");
  return {status: "unavailable"};
}
