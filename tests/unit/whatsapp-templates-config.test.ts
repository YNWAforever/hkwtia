import {describe, expect, it} from "vitest";

import {
  LOCALIZED_WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
} from "@/config/whatsapp-templates";

describe("registered WhatsApp templates", () => {
  it("exposes every registered key exactly once", () => {
    expect([...WHATSAPP_TEMPLATE_KEYS].sort())
      .toEqual(Object.keys(WHATSAPP_TEMPLATES).sort());
  });

  it("resolves every locale pair to a registered key", () => {
    for (const pair of Object.values(LOCALIZED_WHATSAPP_TEMPLATES)) {
      for (const key of Object.values(pair)) {
        expect(WHATSAPP_TEMPLATES).toHaveProperty(key);
      }
    }
  });

  // B-5: the runner picks one half of the pair and hands it a single variable
  // set, so a pair whose halves disagree on the parameter order would send the
  // event title where WOZTELL expects the member name — in one language only,
  // which is the hardest kind of bug to see from here.
  it("keeps both halves of a pair on the same ordered parameters", () => {
    for (const pair of Object.values(LOCALIZED_WHATSAPP_TEMPLATES)) {
      const [first, ...rest] = Object.values(pair)
        .map((key) => WHATSAPP_TEMPLATES[key].variables);
      for (const variables of rest) expect(variables).toEqual(first);
    }
  });

  it("registers the reminder pair under the names spec §8.3 submits", () => {
    // Two templates, not one: `wtia_event_reminder_24h{,_zh_hk}` — reconciled
    // 2026-09-12 onto C-7's registry naming, which dropped the `_en` suffix the
    // English half originally had (B-5).
    expect(LOCALIZED_WHATSAPP_TEMPLATES.event_reminder_24h).toEqual({
      en: "event_reminder_24h",
      "zh-HK": "event_reminder_24h_zh_hk",
    });
    expect(WHATSAPP_TEMPLATES.event_reminder_24h).toMatchObject({
      name: "wtia_event_reminder_24h",
      languageCode: "en_US",
    });
    expect(WHATSAPP_TEMPLATES.event_reminder_24h_zh_hk).toMatchObject({
      name: "wtia_event_reminder_24h_zh_hk",
      languageCode: "zh_HK",
    });
  });
});
