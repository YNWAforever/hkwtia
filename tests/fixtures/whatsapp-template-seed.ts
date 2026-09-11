import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/** One row as `drizzle/0034_phase_c_whatsapp_template_seed.sql` writes it. */
export type WhatsAppTemplateSeedRow = Readonly<{
  key: WhatsAppTemplateKey;
  elementName: string;
  languageCode: string;
  category: "marketing" | "utility" | "authentication";
  variables: readonly string[];
}>;

/**
 * The twin of 0034. The seed runs once, against a database no local gate has,
 * so its contents are only ever asserted as behaviour through this mirror —
 * the same reason tests/fixtures/company-slug.ts exists for 0029. Keep the two
 * in step row for row; a template whose `variables` order drifts from the
 * config sends the right words in the wrong slots and Meta accepts it.
 */
export function whatsappTemplateSeedRows(): readonly WhatsAppTemplateSeedRow[] {
  return (Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[]).map((key) => {
    const template = WHATSAPP_TEMPLATES[key];
    return {
      key,
      elementName: template.name,
      languageCode: template.languageCode,
      category: template.category,
      variables: template.variables,
    };
  });
}
