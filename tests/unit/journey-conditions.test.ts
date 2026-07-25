import {describe, expect, it} from "vitest";

import {JOURNEYS} from "@/config/journeys";
import {evaluateStep, shouldCreateStaffTask} from "@/lib/automation/conditions";
import type {JourneyContext} from "@/lib/automation/types";

const context = (overrides: Partial<JourneyContext> = {}): JourneyContext => ({
  hasLoggedIn: false,
  profileCompleteness: 0,
  marketingConsent: true,
  emailSuppressed: false,
  whatsappOptIn: false,
  whatsappNumber: null,
  engagementScore: null,
  ...overrides,
});

const step = (journey: keyof typeof JOURNEYS, key: string) => {
  const found = JOURNEYS[journey].find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Missing ${journey}/${key}`);
  return found;
};

describe("evaluateStep", () => {
  it("sends the day 7 nudge only when the member has not logged in", () => {
    const day7 = step("onboarding_90d", "day7_nudge");

    expect(evaluateStep(day7, context({hasLoggedIn: false}))).toBe("send");
    expect(evaluateStep(day7, context({hasLoggedIn: true}))).toBe("skip_condition");
  });

  it("sends the day 7 mixer only when the member has logged in", () => {
    const day7 = step("onboarding_90d", "day7_mixer");

    expect(evaluateStep(day7, context({hasLoggedIn: true}))).toBe("send");
    expect(evaluateStep(day7, context({hasLoggedIn: false}))).toBe("skip_condition");
  });

  it("sends the day 14 profile message only below 70 percent completeness", () => {
    const day14 = step("onboarding_90d", "day14_profile");

    expect(evaluateStep(day14, context({profileCompleteness: 69}))).toBe("send");
    expect(evaluateStep(day14, context({profileCompleteness: 70}))).toBe("skip_condition");
  });

  it("suppresses marketing messages when current marketing consent is absent", () => {
    const marketingStep = step("onboarding_90d", "day30_recap");
    const transactionalStep = step("onboarding_90d", "welcome");

    expect(evaluateStep(marketingStep, context({marketingConsent: false}))).toBe("skip_suppressed");
    expect(evaluateStep(transactionalStep, context({marketingConsent: false}))).toBe("send");
  });

  it("suppresses email-only messages when email is suppressed", () => {
    expect(evaluateStep(step("onboarding_90d", "welcome"), context({emailSuppressed: true})))
      .toBe("skip_suppressed");
  });

  it("uses WhatsApp as an eligible alternative only with opt-in and a number", () => {
    const renewal = step("renewal", "renewal_14");

    expect(evaluateStep(renewal, context({emailSuppressed: true, whatsappOptIn: true, whatsappNumber: "+85290000000"})))
      .toBe("send");
    expect(evaluateStep(renewal, context({emailSuppressed: true, whatsappOptIn: false, whatsappNumber: "+85290000000"})))
      .toBe("skip_suppressed");
    expect(evaluateStep(renewal, context({emailSuppressed: true, whatsappOptIn: true, whatsappNumber: null})))
      .toBe("skip_suppressed");
  });

  it("flags a low D90 score for the later staff task without suppressing the email", () => {
    const day90 = step("onboarding_90d", "day90_review");

    expect(evaluateStep(day90, context({engagementScore: 10}))).toBe("send");
    expect(shouldCreateStaffTask(day90.key, context({engagementScore: 19}))).toBe(true);
    expect(shouldCreateStaffTask(day90.key, context({engagementScore: 20}))).toBe(false);
    expect(shouldCreateStaffTask("welcome", context({engagementScore: 0}))).toBe(false);
  });
});
