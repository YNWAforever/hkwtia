export const WHATSAPP_CONSENT_TEXT_VERSION = "2026-09-v1";

export type WhatsAppConsentSource = "join" | "portal" | "rsvp" | "interest_form" | "whatsapp_inbound";

export type WhatsAppConsentFields = Readonly<{
  whatsappOptIn: boolean;
  whatsappConsentAt: Date | null;
  whatsappConsentSource: WhatsAppConsentSource | null;
  whatsappConsentTextVersion: string | null;
}>;

/** Programme D-7: every opt-in carries when, where and which wording. */
export function whatsappConsentFields(input: Readonly<{optIn: boolean; source: WhatsAppConsentSource; now?: () => Date}>): WhatsAppConsentFields {
  if (!input.optIn) return {whatsappOptIn: false, whatsappConsentAt: null, whatsappConsentSource: null, whatsappConsentTextVersion: null};
  return {
    whatsappOptIn: true,
    whatsappConsentAt: (input.now ?? (() => new Date()))(),
    whatsappConsentSource: input.source,
    whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
  };
}
