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

  // Public copy had drifted badly behind the product: pages claiming no
  // accounts, forms, payments or live AI agent long after all four shipped, a
  // FAQ saying online joining was still "planned", and internal milestone
  // labels leaking onto public pages.
  it("states nothing that the platform has outgrown", () => {
    // Namespaces rendered to the public. Staff-facing copy is out of scope.
    const publicNamespaces = [
      "Home", "About", "Chairman", "Committees", "Contact", "Privacy",
      "AiTransparency", "News", "Events", "programs", "Membership",
      "LaunchPad", "Showcase", "AiOps", "NotFound", "Error", "Navigation",
      "Footer", "Metadata",
    ] as const;

    const stale = [
      /later milestone/i, /public preview/i,
      /planned for/i, /arrives in/i, /no AI agent/i,
      /後續里程碑/, /正在整理/, /公開預覽/,
    ];
    // AiOps is excluded from the milestone-token check on purpose: its
    // "acceptance" label is the link text for docs/acceptance/m4.md, so naming
    // M4 there is accurate rather than stale.
    const milestoneToken = /\bM[0-6]\b/;

    for (const [locale, bundle] of bundles) {
      for (const ns of publicNamespaces) {
        const copy = JSON.stringify(bundle[ns as keyof typeof bundle] ?? {});
        for (const pattern of stale) {
          expect(copy, `${locale}.${ns} matched ${pattern}`).not.toMatch(pattern);
        }
        if (ns !== "AiOps") {
          expect(copy, `${locale}.${ns} names a milestone`).not.toMatch(milestoneToken);
        }
      }
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
