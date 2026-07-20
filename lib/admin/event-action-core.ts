import {z} from "zod";

export type EventActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type EventFormOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<unknown>;
}>;
type SimpleOptions = Readonly<{successMessage: string; errorMessage: string; mutate: (formData: FormData) => Promise<unknown>}>;
const preservedFields = ["slug", "titleEn", "titleZh", "descriptionEn", "descriptionZh", "startsAt", "endsAt", "venue", "capacity", "memberOnly", "published"] as const;

export async function runEventFormAction(_state: EventActionState, formData: FormData, options: EventFormOptions): Promise<EventActionState> {
  const values = Object.fromEntries(preservedFields.map((name) => [name, String(formData.get(name) ?? "")]));
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) => typeof issue.path[0] === "string" ? [[issue.path[0], options.validationMessage]] : []));
      return {status: "error", message: options.validationMessage, fieldErrors, values};
    }
    return {status: "error", message: options.errorMessage, values};
  }
}

export async function runCheckInAction(_state: EventActionState, formData: FormData, options: SimpleOptions): Promise<EventActionState> {
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch {
    return {status: "error", message: options.errorMessage};
  }
}
