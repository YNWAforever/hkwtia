/**
 * These names and ordered body parameters must be created and approved in the
 * configured WOZTELL WhatsApp channel before live delivery is enabled.
 * Runtime callers may select only these keys; raw template names are rejected.
 *
 * `category` mirrors Meta's own classification and is the column
 * `whatsapp_templates.category` seeds from (migration 0034, programme C-7).
 * It is not decoration: Phase C2's send queue derives a campaign's consent
 * requirement from it, and `whatsapp_templates_category_check` has a
 * 'marketing' arm that nothing would exercise while every configured template
 * is utility.
 */
export const WHATSAPP_TEMPLATES = {
  renewal_14: {
    name: "wtia_renewal_d14",
    languageCode: "en_US",
    category: "utility",
    variables: ["memberName", "renewalDate", "renewalUrl"],
    approvalRequirement: "WOZTELL template wtia_renewal_d14 must be approved with three BODY text parameters in this order.",
  },
  dunning_3: {
    name: "wtia_dunning_d3",
    languageCode: "en_US",
    category: "utility",
    variables: ["memberName", "amountDue", "paymentUrl"],
    approvalRequirement: "WOZTELL template wtia_dunning_d3 must be approved with three BODY text parameters in this order.",
  },
  concierge_follow_up_en: {
    name: "wtia_concierge_follow_up_en",
    languageCode: "en_US",
    category: "utility",
    variables: ["memberName", "supportUrl"],
    approvalRequirement: "WOZTELL template wtia_concierge_follow_up_en must be approved with two BODY text parameters in this order.",
  },
  concierge_follow_up_zh_hk: {
    name: "wtia_concierge_follow_up_zh_hk",
    languageCode: "zh_HK",
    category: "utility",
    variables: ["memberName", "supportUrl"],
    approvalRequirement: "WOZTELL template wtia_concierge_follow_up_zh_hk must be approved with two BODY text parameters in this order.",
  },
  // Programme B-5: the journey runner only sends WhatsApp when this key is in
  // WOZTELL_APPROVED_TEMPLATE_KEYS; until approval the step delivers by email alone.
  event_reminder_24h: {
    name: "wtia_event_reminder_24h",
    languageCode: "en_US",
    category: "utility",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h must be approved with four BODY text parameters in this order.",
  },
  // Spec §8.3's marketing templates (programme C-5/C-7, Phase C2 Task 1).
  // Without these the 'marketing' arm of whatsapp_templates_category_check is
  // never exercised and the announcement blast that /admin/campaigns exists to
  // send has no template to send. Adding keys is safe by construction: the
  // `as const` below is what types every send call site, journey steps name
  // only the three journey keys, and `approvedTemplateKeys` returns the whole
  // set in mock mode — which is what lets the wizard offer these in CI.
  wtia_announcement_en: {
    name: "wtia_announcement_en",
    languageCode: "en_US",
    category: "marketing",
    variables: ["memberName", "headline", "detailUrl"],
    approvalRequirement: "Marketing template; submit with the Phase C batch (spec §8.3). WOZTELL template wtia_announcement_en must be approved with three BODY text parameters in this order.",
  },
  wtia_announcement_zh_hk: {
    name: "wtia_announcement_zh_hk",
    languageCode: "zh_HK",
    category: "marketing",
    variables: ["memberName", "headline", "detailUrl"],
    approvalRequirement: "Marketing template; submit with the Phase C batch (spec §8.3). WOZTELL template wtia_announcement_zh_hk must be approved with three BODY text parameters in this order.",
  },
  wtia_lead_followup_en: {
    name: "wtia_lead_followup_en",
    languageCode: "en_US",
    category: "marketing",
    variables: ["contactName", "topic", "replyUrl"],
    approvalRequirement: "Marketing template; submit with the Phase C batch (spec §8.3). WOZTELL template wtia_lead_followup_en must be approved with three BODY text parameters in this order.",
  },
  wtia_lead_followup_zh_hk: {
    name: "wtia_lead_followup_zh_hk",
    languageCode: "zh_HK",
    category: "marketing",
    variables: ["contactName", "topic", "replyUrl"],
    approvalRequirement: "Marketing template; submit with the Phase C batch (spec §8.3). WOZTELL template wtia_lead_followup_zh_hk must be approved with three BODY text parameters in this order.",
  },
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;
