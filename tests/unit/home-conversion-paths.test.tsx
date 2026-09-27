import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const plans = vi.hoisted(() => ({list: vi.fn()}));
vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: plans}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign((key: string) => String(messageAt(locale, namespace, key)), {raw: (key: string) => messageAt(locale, namespace, key)})),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ConversionPaths", () => {
  afterEach(() => {vi.unstubAllEnvs(); plans.list.mockReset();});
  it("renders the membership and partnership panels with real PublicRoute hrefs", async () => {
    plans.list.mockResolvedValueOnce([]);
    const {ConversionPaths} = await import("@/components/home/conversion-paths");
    render(await ConversionPaths({locale: "en"}));

    const membership = screen.getByText(bundles.en.Home.conversionPaths.membership.title).closest("article")!;
    expect(within(membership).getByRole("link", {name: bundles.en.Home.conversionPaths.membership.primaryAction})).toHaveAttribute("href", "/membership");
    expect(within(membership).getByRole("link", {name: bundles.en.Home.conversionPaths.membership.secondaryAction})).toHaveAttribute("href", "/join");
    expect(within(membership).getAllByRole("listitem")).toHaveLength(3);
    expect(membership.closest("section")).toHaveClass("conversion-section");

    const partnership = screen.getByText(bundles.en.Home.conversionPaths.partnership.title).closest("article")!;
    expect(within(partnership).getByRole("link", {name: bundles.en.Home.conversionPaths.partnership.primaryAction})).toHaveAttribute("href", "/contact");
    expect(within(partnership).getByRole("link", {name: bundles.en.Home.conversionPaths.partnership.secondaryAction})).toHaveAttribute("href", "/about");
  });
  it("shows paid home fees only when the same persisted catalog and configured price reference reconcile", async () => {
    plans.list.mockResolvedValueOnce([{
      code: "startup", audience: "startup", billingBehavior: "checkout", seatAllowance: 5,
      active: true, annualPriceHkd: 1200, monthlyPriceHkd: null, stripePriceReference: null,
    }]);
    vi.stubEnv("STRIPE_STARTUP_PRICE_ID", "price_test_startup");
    const {ConversionPaths} = await import("@/components/home/conversion-paths");
    render(await ConversionPaths({locale: "en"}));
    const membership = screen.getByText(bundles.en.Home.conversionPaths.membership.title).closest("article")!;
    expect(within(membership).getByText(/HK\$1,200/)).toBeInTheDocument();
    expect(within(membership).getByText(/Startup/)).toBeInTheDocument();
  });
});
