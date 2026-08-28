import {z} from "zod";
import {landingPartnerFormInput} from "@/lib/admin/landing-partner-form-input";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import type {PartnerActionState} from "@/lib/admin/partner-action-core";

const fields = ["organizationEn", "organizationZhHk", "market", "region", "mouStatus", "contactJson", "notes"] as const;

export async function runLandingPartnerFormAction(_state: PartnerActionState, data: FormData, options: Readonly<{successMessage: string; validationMessage: string; errorMessage: string; mutate: (input: ReturnType<typeof landingPartnerFormInput>) => Promise<unknown>}>): Promise<PartnerActionState> {
  const values = Object.fromEntries(fields.map((name) => [name, String(data.get(name) ?? "")]));
  try {
    await options.mutate(landingPartnerFormInput(data));
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) return {status: "error", message: options.validationMessage, fieldErrors: Object.fromEntries(error.issues.flatMap((issue) => typeof issue.path[0] === "string" ? [[issue.path[0], options.validationMessage]] : [])), values};
    return {status: "error", message: options.errorMessage, values};
  }
}
