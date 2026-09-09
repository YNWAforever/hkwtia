/**
 * These names and ordered body parameters must be created and approved in the
 * configured WOZTELL WhatsApp channel before live delivery is enabled.
 * Runtime callers may select only these keys; raw template names are rejected.
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
  concierge_follow_up_en: {
    name: "wtia_concierge_follow_up_en",
    languageCode: "en_US",
    variables: ["memberName", "supportUrl"],
    approvalRequirement: "WOZTELL template wtia_concierge_follow_up_en must be approved with two BODY text parameters in this order.",
  },
  concierge_follow_up_zh_hk: {
    name: "wtia_concierge_follow_up_zh_hk",
    languageCode: "zh_HK",
    variables: ["memberName", "supportUrl"],
    approvalRequirement: "WOZTELL template wtia_concierge_follow_up_zh_hk must be approved with two BODY text parameters in this order.",
  },
  // Programme B-5: the journey runner only sends WhatsApp when this key is in
  // WOZTELL_APPROVED_TEMPLATE_KEYS; until approval the step delivers by email alone.
  event_reminder_24h: {
    name: "wtia_event_reminder_24h",
    languageCode: "en_US",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h must be approved with four BODY text parameters in this order.",
  },
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;
