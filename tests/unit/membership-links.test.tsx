import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {TierComparison, type MembershipTier} from "@/components/marketing/tier-comparison";

const labels = {free: "Free", review: "Contact us", annual: "per year", monthly: "per month"};
const common = {description: "description", benefits: ["benefit"], labels} as const;
const tiers: MembershipTier[] = [
  {...common, code: "community", name: "community", price: {kind: "free"}, cta: {href: "/join?plan=community", kind: "join"}, action: "Action community"},
  {...common, code: "startup", name: "startup", price: {kind: "paid", options: [{amount: "HK$1,200.00", cadence: "annual"}, {amount: "HK$120.00", cadence: "monthly"}]}, cta: {href: "/join?plan=startup", kind: "join"}, action: "Action startup"},
  {...common, code: "corporate", name: "corporate", price: {kind: "paid", options: [{amount: "HK$1,800.00", cadence: "annual"}]}, cta: {href: "/join?plan=corporate", kind: "join"}, action: "Action corporate"},
  {...common, code: "patron", name: "patron", price: {kind: "review"}, cta: {href: "/contact", kind: "contact"}, action: "Action patron"},
];

describe("TierComparison membership actions", () => {
  it.each([
    ["en", "/join"],
    ["zh-HK", "/zh/join"],
  ] as const)("renders the exact locale-aware catalog CTA for %s", (locale, pathname) => {
    render(<TierComparison locale={locale} tiers={tiers} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      [`${pathname}?plan=community`, `${pathname}?plan=startup`, `${pathname}?plan=corporate`, locale === "en" ? "/contact" : "/zh/contact"],
    );
  });
});
