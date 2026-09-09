import {describe, expect, it} from "vitest";

import {
  EMAIL_TEMPLATE_IDS,
  getEmailTemplate,
  type EmailTemplateId,
} from "@/lib/email/catalog";

const REQUIRED_TEMPLATE_IDS = [
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
  "event_guest_confirmation",
] as const satisfies readonly EmailTemplateId[];

// Every placeholder any template interpolates; a template that needs a new one
// must add it here, or the copy check below throws EMAIL_VARIABLE_MISSING.
const FIXTURE_VARIABLES = {
  recipientName: "Fixture Member",
  eventTitle: "Fixture Event",
  cancelUrl: "https://www.hkwtia.org/api/events/guest/cancel?token=fixture",
} as const;

describe("email catalogue", () => {
  it("contains exactly the 24 approved template IDs in stable order", () => {
    expect(EMAIL_TEMPLATE_IDS).toEqual(REQUIRED_TEMPLATE_IDS);
    expect(new Set(EMAIL_TEMPLATE_IDS).size).toBe(24);
  });

  it("keeps the guest confirmation transactional and carries the cancel link in its body", () => {
    const template = getEmailTemplate("en", "event_guest_confirmation", FIXTURE_VARIABLES);
    expect(template.classification).toBe("transactional");
    expect(template.copy.subject).toContain("Fixture Event");
    expect(template.copy.body).toContain(FIXTURE_VARIABLES.cancelUrl);
    expect(() => getEmailTemplate("en", "event_guest_confirmation", FIXTURE_VARIABLES, "marketing")).toThrow("EMAIL_CLASSIFICATION_OVERRIDE_FORBIDDEN");
  });

  it.each(["en", "zh-HK"] as const)(
    "provides complete copy for every template in %s",
    (locale) => {
      for (const templateId of REQUIRED_TEMPLATE_IDS) {
        const template = getEmailTemplate(locale, templateId, FIXTURE_VARIABLES);

        expect(Object.keys(template.copy).sort()).toEqual([
          "body",
          "cta",
          "heading",
          "preview",
          "subject",
        ]);
        for (const value of Object.values(template.copy)) {
          expect(value.trim()).not.toBe("");
          expect(value).not.toMatch(/MISSING|undefined/i);
        }
      }
    },
  );

  it("permits the shared lapsed survey to follow the delivery classification", () => {
    expect(getEmailTemplate("en", "lapsed_survey", {recipientName: "Fixture Member"}, "transactional").classification)
      .toBe("transactional");
    expect(getEmailTemplate("en", "lapsed_survey", {recipientName: "Fixture Member"}, "marketing").classification)
      .toBe("marketing");
  });

  it.each(["campaign_generic", "day1_video"] as const)(
    "rejects a classification downgrade for %s",
    (templateId) => {
      expect(() => getEmailTemplate(
        "en",
        templateId,
        {recipientName: "Fixture Member"},
        "transactional",
      )).toThrow("EMAIL_CLASSIFICATION_OVERRIDE_FORBIDDEN");
    },
  );
});
