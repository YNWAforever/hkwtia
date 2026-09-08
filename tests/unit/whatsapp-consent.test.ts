import {describe, expect, it} from "vitest";

import {WHATSAPP_CONSENT_TEXT_VERSION, whatsappConsentFields} from "@/lib/whatsapp/consent";

describe("whatsappConsentFields", () => {
  const at = new Date("2026-09-08T10:00:00.000Z");
  it("stamps provenance when opting in", () => {
    expect(whatsappConsentFields({optIn: true, source: "join", now: () => at})).toEqual({
      whatsappOptIn: true,
      whatsappConsentAt: at,
      whatsappConsentSource: "join",
      whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
    });
  });
  it("clears opt-in and provenance when opting out", () => {
    expect(whatsappConsentFields({optIn: false, source: "portal", now: () => at})).toEqual({
      whatsappOptIn: false,
      whatsappConsentAt: null,
      whatsappConsentSource: null,
      whatsappConsentTextVersion: null,
    });
  });
});
