import type {AppLocale} from "@/i18n/routing";

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
 *
 * Reconciled 2026-09-12: C-9's registry rewrite made `whatsapp_templates`
 * (read through `lib/whatsapp/approved-templates.ts`) the real approval gate,
 * but on the way it dropped B-5's per-locale resolution for
 * `event_reminder_24h` — see `LOCALIZED_WHATSAPP_TEMPLATES` below, restored on
 * top of the registry rather than the static `WOZTELL_APPROVED_TEMPLATE_KEYS`
 * gate B-5 originally paired it with.
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
  // Programme B-5, corrected by C-7 (Phase C2 Task 2). The old sentence here
  // claimed the journey runner checked WOZTELL_APPROVED_TEMPLATE_KEYS before
  // sending this key. It did not: `whatsappTemplate(step)` accepted any own
  // property of this object, so an unapproved element name went straight to the
  // provider. The gate is now the `whatsapp_templates` registry, read through
  // `lib/whatsapp/approved-templates.ts` and passed into the runner's dependency
  // bag; a step whose template is not approved delivers by email alone. Also
  // registered as a per-locale pair with `event_reminder_24h_zh_hk` below — see
  // `LOCALIZED_WHATSAPP_TEMPLATES` — because a single en_US template gave a
  // zh-HK member their reminder email in Chinese and their WhatsApp in English.
  event_reminder_24h: {
    name: "wtia_event_reminder_24h",
    languageCode: "en_US",
    category: "utility",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h must be approved with four BODY text parameters in this order.",
  },
  event_reminder_24h_zh_hk: {
    name: "wtia_event_reminder_24h_zh_hk",
    languageCode: "zh_HK",
    category: "utility",
    variables: ["memberName", "eventTitle", "startsAt", "eventUrl"],
    approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3). WOZTELL template wtia_event_reminder_24h_zh_hk must be approved with four BODY text parameters in this order.",
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

/**
 * Every registered key, for callers that need the whole registry as a list —
 * test fixtures mostly. Derived rather than restated so adding a template
 * above cannot leave a second list behind.
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
 * before checking the resolved key against the whatsapp_templates registry.
 * Steps with a single template (renewal_14, dunning_3) simply have no entry.
 */
export const LOCALIZED_WHATSAPP_TEMPLATES = {
  event_reminder_24h: {
    en: "event_reminder_24h",
    "zh-HK": "event_reminder_24h_zh_hk",
  },
} as const satisfies Readonly<
  Record<string, Readonly<Record<AppLocale, WhatsAppTemplateKey>>>
>;
