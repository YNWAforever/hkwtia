import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {TierComparison, type MembershipTier} from "@/components/marketing/tier-comparison";

const tiers = ["community", "startup", "corporate", "patron"].map((id) => ({
  id,
  name: id,
  price: "price",
  cadence: "cadence",
  description: "description",
  benefits: ["benefit"],
  action: `Join ${id}`,
})) satisfies MembershipTier[];

describe("TierComparison membership actions", () => {
  it.each([
    ["en", "/join"],
    ["zh-HK", "/zh/join"],
  ] as const)("renders exactly four locale-aware join links for %s", (locale, pathname) => {
    render(<TierComparison locale={locale} tiers={tiers} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      tiers.map((tier) => `${pathname}?plan=${tier.id}`),
    );
  });
});
