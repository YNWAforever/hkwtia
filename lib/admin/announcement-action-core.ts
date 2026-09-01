import {z} from "zod";

import {announcementFormInput, type AnnouncementFormInput} from "@/lib/admin/announcement-form-input";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type AnnouncementActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type AnnouncementFormOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (input: AnnouncementFormInput) => Promise<unknown>;
}>;

const preservedFields = [
  "titleEn", "titleZhHk", "ctaLabelEn", "ctaLabelZhHk",
  "href", "startsAt", "endsAt", "priority",
] as const;

export async function runAnnouncementFormAction(
  _state: AnnouncementActionState,
  formData: FormData,
  options: AnnouncementFormOptions,
): Promise<AnnouncementActionState> {
  const values = Object.fromEntries(
    preservedFields.map((name) => [name, String(formData.get(name) ?? "")]),
  );
  try {
    await options.mutate(announcementFormInput(formData));
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string"
          ? [[issue.path[0], options.validationMessage]]
          : []));
      return {
        status: "error",
        message: options.validationMessage,
        fieldErrors,
        values,
      };
    }
    return {status: "error", message: options.errorMessage, values};
  }
}
