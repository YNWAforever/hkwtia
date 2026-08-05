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

  it.each(bundles)("%s gives every plan a complete card", (_locale, bundle) => {
    for (const code of MEMBERSHIP_PLAN_CODES) {
      const tier = bundle.Membership.tiers[code];
      for (const field of ["name", "price", "cadence", "description"] as const) {
        expect(tier[field], `${code}.${field}`).toBeTruthy();
      }
    }
  });
});
