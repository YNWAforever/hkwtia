import { resolveReadModelTree } from "@/tests/fixtures/resolve-read-model-tree";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedMembershipPlan } from "@/lib/membership/public-catalog";

const membershipPlans = vi.hoisted(() => ({ list: vi.fn() }));
const localeState = vi.hoisted(() => ({ locale: "en" }));

vi.mock("@/lib/db/repos/membership-plans", () => ({
  membershipPlansRepository: membershipPlans,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string) => {
    localeState.locale = locale;
  },
  getTranslations: async () => {
    const t = (key: string) => lookup(key);
    // The page reads the per-tier benefit arrays through t.raw (programme D-5).
    (t as unknown as { raw: (key: string) => unknown }).raw = (key: string) =>
      key.startsWith("tierBenefits.") ? [`${key} benefit`] : lookup(key);
    return t;
  },
}));

function lookup(key: string): string {
  const messages: Record<string, Record<string, string>> = {
    en: {
      unavailable: "Membership is currently unavailable",
      "tiers.individual.name": "Individual",
      "tiers.corporate.name": "Corporate",
      "tiers.platinum.name": "Platinum",
      "tiers.individual.description": "Individual description",
      "priceLabels.free": "Free",
      "priceLabels.review": "Contact us",
      "cadenceLabels.annual": "per year",
      "cadenceLabels.monthly": "per month",
      "actions.join": "Choose this plan",
      "actions.contact": "Contact us",
    },
    "zh-HK": {
      unavailable: "會員計劃暫時未能提供",
      "tiers.individual.name": "個人",
      "tiers.corporate.name": "企業",
      "tiers.platinum.name": "白金",
      "tiers.individual.description": "個人簡介",
      "priceLabels.free": "免費",
      "priceLabels.review": "聯絡我們",
      "cadenceLabels.annual": "每年",
      "cadenceLabels.monthly": "每月",
      "actions.join": "選擇此計劃",
      "actions.contact": "聯絡我們",
    },
  };
  return messages[localeState.locale]?.[key] ?? key;
}
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import MembershipPage, * as membershipPageModule from "@/app/[locale]/(public)/membership/page";

const community = {
  code: "community",
  audience: "individual",
  billingBehavior: "free",
  seatAllowance: 1,
  active: true,
  annualPriceHkd: 0,
  monthlyPriceHkd: null,
  stripePriceReference: null,
} satisfies PersistedMembershipPlan;

async function renderMembership(
  rows: readonly PersistedMembershipPlan[],
  locale: "en" | "zh-HK" = "en",
) {
  membershipPlans.list.mockResolvedValue(rows);
  return renderToStaticMarkup(
    await resolveReadModelTree(
      await MembershipPage({ params: Promise.resolve({ locale }) }),
    ),
  );
}

describe("repository-backed Membership page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeState.locale = "en";
  });

  it("renders dynamically so persisted availability and pricing stay current", () => {
    expect((membershipPageModule as { dynamic?: string }).dynamic).toBe(
      "force-dynamic",
    );
  });

  it.each([
    ["en", "Individual"],
    ["zh-HK", "個人"],
  ] as const)(
    "shows the ops tiers even when the %s catalog read is empty",
    async (locale, name) => {
      const html = await renderMembership([], locale);
      expect(html).toContain(name);
      expect(html).toContain('href="/join?plan=individual"');
      expect(html).not.toContain(locale === "en" ? "Membership is currently unavailable" : "會員計劃暫時未能提供");
    },
  );

  it("still shows the ops tiers when the repository read fails", async () => {
    membershipPlans.list.mockRejectedValue(
      new Error("database private payload"),
    );

    const html = renderToStaticMarkup(
      await resolveReadModelTree(
        await MembershipPage({ params: Promise.resolve({ locale: "en" }) }),
      ),
    );

    expect(html).toContain("Individual");
    expect(html).toContain('href="/join?plan=corporate"');
    expect(html).not.toContain("database private payload");
  });

  it("renders answer-bearing FAQ entries and support links for unresolved terms", async () => {
    const html = await renderMembership([community]);
    for (let index = 0; index < 8; index += 1) {
      expect(html).toContain(`faq.${index}.question`);
      expect(html).toContain(`faq.${index}.answer`);
    }
    expect(html).toContain('href="/refund-policy"');
    expect(html).toContain('href="/contact"');
  });

  it("renders only reconciled tiers with localized labels and persisted CTAs", async () => {
    const html = await renderMembership([community]);

    expect(membershipPlans.list).toHaveBeenCalledOnce();
    expect(html).toContain("Individual");
    expect(html).toContain("HK$500");
    expect(html).toContain('href="/join?plan=individual"');
    expect(html).not.toContain("Membership is currently unavailable");
  });
});
