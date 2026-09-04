import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {PersistedMembershipPlan} from "@/lib/membership/public-catalog";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const membershipPlans = vi.hoisted(() => ({list: vi.fn()}));

vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: membershipPlans}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import MembershipPage from "@/app/[locale]/(public)/membership/page";

const startup: PersistedMembershipPlan = {
  code: "startup", audience: "startup", billingBehavior: "checkout", seatAllowance: 5, active: true,
  annualPriceHkd: 120000, monthlyPriceHkd: 12000, stripePriceReference: "price_startup",
};
const community: PersistedMembershipPlan = {
  code: "community", audience: "individual", billingBehavior: "free", seatAllowance: 1, active: true,
  annualPriceHkd: 0, monthlyPriceHkd: null, stripePriceReference: null,
};
const patron: PersistedMembershipPlan = {
  code: "patron", audience: "patron", billingBehavior: "review", seatAllowance: 1, active: true,
  annualPriceHkd: null, monthlyPriceHkd: null, stripePriceReference: null,
};

async function renderMembership(rows: readonly PersistedMembershipPlan[]) {
  membershipPlans.list.mockResolvedValue(rows);
  const originalEnv = {...process.env};
  process.env.STRIPE_STARTUP_PRICE_ID = "price_startup";
  process.env.STRIPE_CORPORATE_PRICE_ID = "price_corporate";
  const html = renderToStaticMarkup(await MembershipPage({params: Promise.resolve({locale: "en"})}));
  process.env = originalEnv;
  return html;
}

describe("/membership rewrite", () => {
  beforeEach(() => { membershipPlans.list.mockReset(); });

  it("renders the plan grid with four anchors plus a fifth, distinct SME card", async () => {
    const html = await renderMembership([community, startup, patron]);

    expect(html).toContain('class="plan-grid"');
    expect(html).toContain('id="community"');
    expect(html).toContain('id="startup"');
    expect(html).not.toContain('id="corporate"');
    expect(html).toContain('id="patron"');
    // Scoped to the plan-grid region: the page also renders <article> tags in the
    // membership-dimensions panel and the first-90-days step grid, so counting across the
    // whole page (as a naive `html.match(/<article/g)` would) overcounts. The test's intent,
    // per its name, is "the plan grid itself has four cards."
    const planGridHtml = html.match(/<div class="plan-grid">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect((planGridHtml.match(/<article/g) ?? []).length).toBe(4);
    expect(html).toContain(bundles.en.Membership.sme.title);
    expect(html).toContain('href="/join?plan=community"');
    expect(html).toContain('href="/join?plan=startup"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain(bundles.en.Membership.actions.discuss);
  });

  it("shows the confirmed-pricing note when both configured price ids resolve", async () => {
    const html = await renderMembership([community, startup]);

    expect(html).toContain('class="pricing-note"');
    expect(html).toContain(bundles.en.Membership.pricing.readyCopy);
    expect(html).not.toContain(bundles.en.Membership.pricing.fallbackCopy);
  });

  it("falls back to the donor's confirm-with-team pricing copy otherwise", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain(bundles.en.Membership.pricing.fallbackCopy);
  });

  it("renders exactly one honest unavailable state for an empty catalog, unchanged", async () => {
    const html = await renderMembership([]);

    expect(html.match(/Membership is currently unavailable/g)).toHaveLength(1);
    expect(html).not.toContain('class="plan-grid"');
  });

  it("renders the 12-tile membership-dimensions panel", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('class="membership-dimensions"');
    expect((html.match(/<article>/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });

  it("renders the first-90-days steps on the real .intro-process grid, not a fabricated .first-90 class", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('class="intro-process"');
    expect(html).not.toContain("first-90");
    expect((html.match(/<article/g) ?? []).length).toBeGreaterThanOrEqual(5 + 4);
  });

  it("closes with /join and mailto: actions", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('href="/join"');
    expect(html).toMatch(/href="mailto:[^"]+"/);
  });
});
