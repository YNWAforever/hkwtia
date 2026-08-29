import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

const bundles = [["en", en], ["zh-HK", zhHK]] as const;

describe("membership tier content", () => {
  // The bundles once carried priced "Individual" and "Platinum" tiers that no
  // plan code backs. Rendering them would have produced /join?plan=... links
  // that checkout rejects.
  it.each(bundles)("%s advertises exactly the purchasable plans", (_locale, bundle) => {
    expect(Object.keys(bundle.Membership.tiers).sort())
      .toEqual([...MEMBERSHIP_PLAN_CODES].sort());
  });

  it.each(bundles)("%s gives every plan durable localized identity copy", (_locale, bundle) => {
    for (const code of MEMBERSHIP_PLAN_CODES) {
      const tier = bundle.Membership.tiers[code];
      for (const field of ["name", "description"] as const) {
        expect(tier[field], `${code}.${field}`).toBeTruthy();
      }
      expect(tier).not.toHaveProperty("price");
      expect(tier).not.toHaveProperty("cadence");
    }
  });

  it.each(bundles)("%s localizes semantic prices, cadences, actions, and failure copy", (_locale, bundle) => {
    expect(Object.values(bundle.Membership.priceLabels).every(Boolean)).toBe(true);
    expect(Object.values(bundle.Membership.cadenceLabels).every(Boolean)).toBe(true);
    expect(Object.values(bundle.Membership.actions).every(Boolean)).toBe(true);
    expect(bundle.Membership.unavailable).toBeTruthy();
  });
});
