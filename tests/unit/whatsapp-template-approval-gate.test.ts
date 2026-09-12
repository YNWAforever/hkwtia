import {afterEach, describe, expect, it, vi} from "vitest";

import {
  LOCALIZED_WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
} from "@/config/whatsapp-templates";
import {approvedWhatsAppTemplateKeys} from "@/lib/channels/approved-templates";

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
    // Two templates, not one: `wtia_event_reminder_24h_{en,zh_hk}`.
    expect(LOCALIZED_WHATSAPP_TEMPLATES.event_reminder_24h).toEqual({
      en: "event_reminder_24h_en",
      "zh-HK": "event_reminder_24h_zh_hk",
    });
    expect(WHATSAPP_TEMPLATES.event_reminder_24h_en).toMatchObject({
      name: "wtia_event_reminder_24h_en",
      languageCode: "en_US",
    });
    expect(WHATSAPP_TEMPLATES.event_reminder_24h_zh_hk).toMatchObject({
      name: "wtia_event_reminder_24h_zh_hk",
      languageCode: "zh_HK",
    });
  });
});

describe("approvedWhatsAppTemplateKeys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("approves everything while the adapter is mocked", () => {
    // RUN_LIVE_WOZTELL unset: lib/channels/woztell.ts reaches no Meta API, so
    // gating here would only hide the send path from every test and preview.
    vi.stubEnv("RUN_LIVE_WOZTELL", "");
    vi.stubEnv("WOZTELL_APPROVED_TEMPLATE_KEYS", "");

    expect([...approvedWhatsAppTemplateKeys(WHATSAPP_TEMPLATE_KEYS)].sort())
      .toEqual([...WHATSAPP_TEMPLATE_KEYS].sort());
  });

  it("approves only the configured keys once live", () => {
    vi.stubEnv("RUN_LIVE_WOZTELL", "1");
    vi.stubEnv(
      "WOZTELL_APPROVED_TEMPLATE_KEYS",
      " event_reminder_24h_en , renewal_14 ",
    );

    const approved = approvedWhatsAppTemplateKeys(WHATSAPP_TEMPLATE_KEYS);

    expect([...approved].sort()).toEqual(["event_reminder_24h_en", "renewal_14"]);
    // The gap this whole work item exists to close: with only the English half
    // approved, the zh-HK half stays out, and the runner drops the WhatsApp leg
    // rather than writing to a zh-HK member in English.
    expect(approved.has("event_reminder_24h_zh_hk")).toBe(false);
  });

  it("approves nothing when the live allowlist is empty", () => {
    vi.stubEnv("RUN_LIVE_WOZTELL", "1");
    vi.stubEnv("WOZTELL_APPROVED_TEMPLATE_KEYS", "");

    expect([...approvedWhatsAppTemplateKeys(WHATSAPP_TEMPLATE_KEYS)]).toEqual([]);
  });
});
