import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {parsePolicySections} from "@/components/marketing/policy-sections";

const bundles = [["en", en], ["zh-HK", zhHK]] as const;

describe("public policy pages", () => {
  it.each(bundles)("%s privacy notice describes the live platform", (_locale, bundle) => {
    const sections = parsePolicySections(bundle.Privacy.sections);
    expect(sections.length).toBeGreaterThanOrEqual(8);
    for (const section of sections) {
      expect(section.body.length + section.items.length).toBeGreaterThan(0);
    }
  });

  it.each(bundles)("%s AI page describes a live assistant", (_locale, bundle) => {
    const sections = parsePolicySections(bundle.AiTransparency.sections);
    expect(sections.length).toBeGreaterThanOrEqual(6);
    for (const section of sections) {
      expect(section.body.length + section.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps both locales structurally in parity", () => {
    for (const key of ["Privacy", "AiTransparency"] as const) {
      const source = parsePolicySections(en[key].sections);
      const target = parsePolicySections(zhHK[key].sections);
      expect(target).toHaveLength(source.length);
      source.forEach((section, index) => {
        expect(target[index]!.body).toHaveLength(section.body.length);
        expect(target[index]!.items).toHaveLength(section.items.length);
      });
    }
  });

  // These pages told visitors the site had no accounts, forms or payments and
  // no live AI agent, long after all four shipped.
  it("states nothing that the platform has outgrown", () => {
    const copy = JSON.stringify({
      privacy: [en.Privacy, zhHK.Privacy],
      ai: [en.AiTransparency, zhHK.AiTransparency],
      programs: [en.programs, zhHK.programs],
      membership: [en.Membership.comingSoon, zhHK.Membership.comingSoon],
    });

    for (const stale of [
      "M0", "M1", "M2", "M3", "M4", "M5", "M6",
      "later milestone", "public preview", "not live",
      "後續里程碑", "正在整理",
    ]) {
      expect(copy).not.toContain(stale);
    }
  });

  it("keeps the privacy notice honest about what the platform does", () => {
    const privacy = JSON.stringify(en.Privacy);
    // Each of these is a real data flow in the codebase.
    for (const disclosure of ["Stripe", "Resend", "WOZTELL", "Neon", "Concierge", "contact@hkwtia.org"]) {
      expect(privacy).toContain(disclosure);
    }
  });
});
