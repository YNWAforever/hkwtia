import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import type {AppLocale} from "@/i18n/routing";
import type {MessageClassification} from "@/lib/automation/types";

export const EMAIL_TEMPLATE_IDS = [
  "welcome",
  "day1_video",
  "day7_nudge",
  "day7_mixer",
  "day14_profile",
  "day30_recap",
  "day45_content",
  "day60_committee",
  "day90_review",
  "renewal_90",
  "renewal_60",
  "renewal_30",
  "renewal_14",
  "dunning_0",
  "dunning_3",
  "dunning_7",
  "lapsed_survey",
  "winback_21",
  "winback_60",
  "lead_ack",
  "lead_staff_notify",
  "approval_request",
  "campaign_generic",
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];
export type EmailVariables = Readonly<Record<string, string | number>>;
export type EmailCopy = Readonly<{
  subject: string;
  preview: string;
  heading: string;
  body: string;
  cta: string;
}>;

type TemplateMessage = Record<keyof EmailCopy, string>;
type EmailMessages = Readonly<{
  brand: string;
  footer: Readonly<{
    address: string;
    reason: string;
    unsubscribe: string;
  }>;
  templates: Record<EmailTemplateId, TemplateMessage>;
}>;

const bundles = {
  en: en as typeof en & {Email: EmailMessages},
  "zh-HK": zhHK as typeof zhHK & {Email: EmailMessages},
} as const;

const DEFAULT_CLASSIFICATION = {
  welcome: "transactional",
  day1_video: "marketing",
  day7_nudge: "transactional",
  day7_mixer: "marketing",
  day14_profile: "transactional",
  day30_recap: "marketing",
  day45_content: "marketing",
  day60_committee: "marketing",
  day90_review: "transactional",
  renewal_90: "transactional",
  renewal_60: "transactional",
  renewal_30: "transactional",
  renewal_14: "transactional",
  dunning_0: "transactional",
  dunning_3: "transactional",
  dunning_7: "transactional",
  lapsed_survey: "transactional",
  winback_21: "marketing",
  winback_60: "marketing",
  lead_ack: "transactional",
  lead_staff_notify: "transactional",
  approval_request: "transactional",
  campaign_generic: "marketing",
} as const satisfies Record<EmailTemplateId, MessageClassification>;

function interpolate(message: string, variables: EmailVariables): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`EMAIL_VARIABLE_MISSING:${name}`);
    return String(value);
  });
}

export function getEmailTemplate(
  locale: AppLocale,
  templateId: EmailTemplateId,
  variables: EmailVariables,
  classification: MessageClassification = DEFAULT_CLASSIFICATION[templateId],
): Readonly<{classification: MessageClassification; copy: EmailCopy}> {
  const message = bundles[locale].Email.templates[templateId];
  const copy = Object.fromEntries(
    (["subject", "preview", "heading", "body", "cta"] as const)
      .map((field) => [field, interpolate(message[field], variables)]),
  ) as EmailCopy;

  return {classification, copy};
}

export function getEmailChrome(locale: AppLocale): Readonly<{
  brand: string;
  footer: EmailMessages["footer"];
}> {
  const {brand, footer} = bundles[locale].Email;
  return {brand, footer};
}
