import {z} from "zod";
import {partnerFormInput} from "@/lib/admin/partner-form-input";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type PartnerActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

const fields = ["nameEn", "nameZhHk", "category", "websiteUrl", "logoMediaId", "displayOrder", "featured", "relationshipStartsOn", "relationshipEndsOn", "relationshipConfirmed", "logoRightsConfirmed"] as const;

export async function runPartnerFormAction(_state: PartnerActionState, data: FormData, options: Readonly<{successMessage: string; validationMessage: string; errorMessage: string; mutate: (input: ReturnType<typeof partnerFormInput>) => Promise<unknown>}>): Promise<PartnerActionState> {
  const values = Object.fromEntries(fields.map((name) => [name, String(data.get(name) ?? "")]));
  try {
    await options.mutate(partnerFormInput(data));
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) return {status: "error", message: options.validationMessage, fieldErrors: Object.fromEntries(error.issues.flatMap((issue) => typeof issue.path[0] === "string" ? [[issue.path[0], options.validationMessage]] : [])), values};
    return {status: "error", message: options.errorMessage, values};
  }
}
