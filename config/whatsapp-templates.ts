import type {AppLocale} from "@/i18n/routing";

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
  // Programme B-5: the journey runner sends WhatsApp only when the resolved key
  // is in WOZTELL_APPROVED_TEMPLATE_KEYS; until approval the step delivers by
  // email alone. Registered as a per-locale pair — see
  // LOCALIZED_WHATSAPP_TEMPLATES below — because a single en_US template gave a
  // zh-HK member their reminder email in Chinese and their WhatsApp in English.
  event_reminder_24h_en: {
    name: "wtia_event_reminder_24h_en",
    languageCode: "en_US",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h_en must be approved with four BODY text parameters in this order.",
  },
  event_reminder_24h_zh_hk: {
    name: "wtia_event_reminder_24h_zh_hk",
    languageCode: "zh_HK",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h_zh_hk must be approved with four BODY text parameters in this order.",
  },
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

/**
 * Every registered key, for callers that need the whole registry as a list —
 * the approval gate in lib/channels/approved-templates.ts. Derived rather than
 * restated so adding a template above cannot leave a second list behind.
 */
export const WHATSAPP_TEMPLATE_KEYS = Object.keys(
  WHATSAPP_TEMPLATES,
) as readonly WhatsAppTemplateKey[];

/**
 * A journey step names one template (`template` in config/journeys.ts), but the
 * member chose a language. Where a step has a per-locale pair — the shape
 * concierge_follow_up_{en,zh_hk} already established, and the shape spec §8.3
 * submits for approval — the pair is registered here, keyed by the step's own
 * template id, and lib/automation/journey-runner.ts resolves through this map
 * before falling back to the step name itself. Steps with a single template
 * (renewal_14, dunning_3) simply have no entry.
 */
export const LOCALIZED_WHATSAPP_TEMPLATES = {
  event_reminder_24h: {
    en: "event_reminder_24h_en",
    "zh-HK": "event_reminder_24h_zh_hk",
  },
} as const satisfies Readonly<
  Record<string, Readonly<Record<AppLocale, WhatsAppTemplateKey>>>
>;
