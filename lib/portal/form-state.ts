export const portalFormFields = ["displayName", "phone", "jobTitle", "locale", "directoryVisible", "whatsappNumber", "whatsappOptIn", "companyId", "legalName", "website", "industry", "sizeBand", "description"] as const;
export type PortalFormField = (typeof portalFormFields)[number];
export type PortalFieldError = "invalid" | "required" | "invalid_number";
export type PortalFormState =
  | Readonly<{status: "idle" | "success" | "forbidden" | "conflict" | "unavailable"}>
  | Readonly<{status: "validation_error"; fieldErrors: Partial<Record<PortalFormField, PortalFieldError>>}>;
export type PortalFormLabels = Readonly<{
  save: string; saving: string; success: string; validation_error: string;
  forbidden: string; conflict: string; unavailable: string;
  fields: Record<PortalFieldError, string>;
}>;

type CopyKey = "save" | `formFeedback.${Exclude<keyof PortalFormLabels, "save" | "fields">}` | `formFeedback.fields.${PortalFieldError}`;
export function portalFormLabels(t: (key: CopyKey) => string): PortalFormLabels {
  return {save: t("save"), saving: t("formFeedback.saving"), success: t("formFeedback.success"),
    validation_error: t("formFeedback.validation_error"), forbidden: t("formFeedback.forbidden"),
    conflict: t("formFeedback.conflict"), unavailable: t("formFeedback.unavailable"),
    fields: {invalid: t("formFeedback.fields.invalid"), required: t("formFeedback.fields.required"), invalid_number: t("formFeedback.fields.invalid_number")}};
}
