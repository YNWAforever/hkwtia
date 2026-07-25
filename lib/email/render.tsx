import {render} from "@react-email/render";

import type {AppLocale} from "@/i18n/routing";
import type {MessageClassification} from "@/lib/automation/types";
import {
  getEmailChrome,
  getEmailTemplate,
  type EmailTemplateId,
  type EmailVariables,
} from "@/lib/email/catalog";
import {MessageEmail} from "@/lib/email/components/message-email";

export type RenderEmailInput = Readonly<{
  template: EmailTemplateId;
  locale: AppLocale;
  recipientName: string;
  variables: EmailVariables;
  classification?: MessageClassification;
  unsubscribeUrl?: string;
}>;

export type RenderedEmail = Readonly<{
  subject: string;
  html: string;
  text: string;
  headers: Readonly<Record<string, string>>;
}>;

export async function renderEmail(input: RenderEmailInput): Promise<RenderedEmail> {
  const variables = {...input.variables, recipientName: input.recipientName};
  const template = getEmailTemplate(
    input.locale,
    input.template,
    variables,
    input.classification,
  );
  const {brand, footer} = getEmailChrome(input.locale);
  const ctaUrlValue = input.variables.ctaUrl;
  if (typeof ctaUrlValue !== "string" || ctaUrlValue.trim().length === 0) {
    throw new Error("EMAIL_CTA_URL_REQUIRED");
  }
  const ctaUrl = ctaUrlValue.trim();
  const isMarketing = template.classification === "marketing";

  if (isMarketing && !input.unsubscribeUrl) {
    throw new Error("MARKETING_UNSUBSCRIBE_URL_REQUIRED");
  }

  const message = (
    <MessageEmail
      locale={input.locale}
      brand={brand}
      copy={template.copy}
      ctaUrl={ctaUrl}
      marketingFooter={isMarketing ? {
        ...footer,
        unsubscribeUrl: input.unsubscribeUrl as string,
      } : undefined}
    />
  );
  const [html, text] = await Promise.all([
    render(message),
    render(message, {plainText: true}),
  ]);
  const headers: Readonly<Record<string, string>> = isMarketing ? {
    "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } : {};

  return {
    subject: template.copy.subject,
    html,
    text,
    headers,
  };
}
