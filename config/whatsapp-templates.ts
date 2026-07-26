/**
 * These names and ordered body parameters must be created and approved in the
 * configured WOZTELL WhatsApp channel before live delivery is enabled.
 * M3 deliberately has no fallback template and does not create templates.
 */
export const WHATSAPP_TEMPLATES = {
  renewal_14: {
    name: "wtia_renewal_d14",
    languageCode: "en_US",
    variables: ["memberName", "renewalDate", "renewalUrl"],
    approvalRequirement: "WOZTELL template wtia_renewal_d14 must be approved with three BODY text parameters in this order.",
  },
  dunning_3: {
    name: "wtia_dunning_d3",
    languageCode: "en_US",
    variables: ["memberName", "amountDue", "paymentUrl"],
    approvalRequirement: "WOZTELL template wtia_dunning_d3 must be approved with three BODY text parameters in this order.",
  },
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;
