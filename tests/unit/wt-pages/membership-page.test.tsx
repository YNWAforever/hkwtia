import { resolveReadModelTree } from "@/tests/fixtures/resolve-read-model-tree";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedMembershipPlan } from "@/lib/membership/public-catalog";

const APPROVED_INDIVIDUAL_BENEFITS = {
  en: [
    "Free participation in networking events with industry experts and professionals",
    "Exclusive networking and business-matching events with C-suite or director-level professionals in the wireless and mobile industries",
    "WTIA event invitations and industry updates by email",
  ],
  "zh-HK": [
    "免費參加業界交流活動，與業界專家及專業人士建立聯繫",
    "專屬交流及商業配對活動，接觸無線及流動通訊業界的高級管理層／總監級專業人士",
    "透過電郵接收 WTIA 活動邀請及業界資訊",
  ],
} as const;

const APPROVED_CORPORATE_BENEFITS = {
  en: [
    "Free participation in networking events with industry experts and professionals",
    "Exclusive networking and business-matching events with C-suite / director-level professionals in wireless & mobile industries",
    "Marketing your in-house events on WTIA social networks",
    "Speaking opportunities in WTIA-organised events and career fairs at higher education institutions",
    "Free posting of job ads and career talks on WTIA website and social networks",
    "Priority invitations to flagship events (e.g. Hong Kong ICT Awards, Tech To Connect)",
  ],
  "zh-HK": [
    "免費參加與業界專家及專業人士的交流活動",
    "與無線及流動通訊業高級管理層／總監級人士的專屬交流及商業配對活動",
    "於 WTIA 社交平台宣傳公司活動",
    "WTIA 活動及大專院校職業博覽的演講機會",
    "免費於 WTIA 網站及社交平台刊登招聘廣告及職業講座",
    "旗艦活動優先邀請（例如香港資訊及通訊科技獎、Tech To Connect）",
  ],
} as const;

const APPROVED_PLATINUM_BENEFITS = {
  en: [
    "Everything in Corporate",
    "Opportunities to join Sub-Committee or Advisory Board",
    "Eligible to vote at WTIA AGM / EGM (General Meetings)",
    "Your first representative is eligible for election to the Executive Committee",
    "Option of a Bespoke Partnership Contract (customised partnership & membership agreement)",
  ],
  "zh-HK": [
    "包括企業會員全部權益",
    "有機會加入小組委員會或顧問委員會",
    "可於 WTIA 週年大會（AGM）／特別大會（EGM）投票",
    "第一代表有權被選為執行委員會成員",
    "可選擇度身訂造的合作及會籍協議（Bespoke Partnership Contract）",
  ],
} as const;

const bundles = {
  en: JSON.parse(
    readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8"),
  ),
  "zh-HK": JSON.parse(
    readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8"),
  ),
} as const;

function messageAt(
  locale: "en" | "zh-HK",
  namespace: string | undefined,
  key: string,
): unknown {
  const root =
    namespace === undefined
      ? bundles[locale]
      : namespace
          .split(".")
          .reduce<unknown>(
            (v, p) => (v as Record<string, unknown> | undefined)?.[p],
            bundles[locale],
          );
  return key
    .split(".")
    .reduce<unknown>(
      (v, p) => (v as Record<string, unknown> | undefined)?.[p],
      root,
    );
}

const membershipPlans = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/db/repos/membership-plans", () => ({
  membershipPlansRepository: membershipPlans,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(
    async ({
      locale,
      namespace,
    }: {
      locale: "en" | "zh-HK";
      namespace?: string;
    }) => {
      const t = (key: string) => String(messageAt(locale, namespace, key));
      (t as unknown as { raw: (key: string) => unknown }).raw = (key: string) =>
        messageAt(locale, namespace, key);
      return t;
    },
  ),
}));
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

import MembershipPage from "@/app/[locale]/(public)/membership/page";

const startup: PersistedMembershipPlan = {
  code: "startup",
  audience: "startup",
  billingBehavior: "checkout",
  seatAllowance: 5,
  active: true,
  annualPriceHkd: 120000,
  monthlyPriceHkd: 12000,
  stripePriceReference: "price_startup",
};
const community: PersistedMembershipPlan = {
  code: "community",
  audience: "individual",
  billingBehavior: "free",
  seatAllowance: 1,
  active: true,
  annualPriceHkd: 0,
  monthlyPriceHkd: null,
  stripePriceReference: null,
};
const patron: PersistedMembershipPlan = {
  code: "patron",
  audience: "patron",
  billingBehavior: "review",
  seatAllowance: 1,
  active: true,
  annualPriceHkd: null,
  monthlyPriceHkd: null,
  stripePriceReference: null,
};
const corporate: PersistedMembershipPlan = {
  code: "corporate",
  audience: "corporate",
  billingBehavior: "checkout",
  seatAllowance: 25,
  active: true,
  annualPriceHkd: 480000,
  monthlyPriceHkd: 48000,
  stripePriceReference: "price_corporate",
};

async function renderMembership(rows: readonly PersistedMembershipPlan[], locale: "en" | "zh-HK" = "en") {
  membershipPlans.list.mockResolvedValue(rows);
  const originalEnv = { ...process.env };
  process.env.STRIPE_STARTUP_PRICE_ID = "price_startup";
  process.env.STRIPE_CORPORATE_PRICE_ID = "price_corporate";
  const html = renderToStaticMarkup(
    await resolveReadModelTree(
      await MembershipPage({ params: Promise.resolve({ locale }) }),
    ),
  );
  process.env = originalEnv;
  return html;
}

describe("/membership rewrite", () => {
  beforeEach(() => {
    membershipPlans.list.mockReset();
  });

  it("renders available plans and separate unnumbered decision help", async () => {
    const html = await renderMembership([community, startup, patron]);

    expect(html).toContain('class="plan-grid"');
    expect(html).toContain('id="community"');
    expect(html).toContain('id="individual"');
    expect(html).toContain('id="corporate"');
    expect(html).toContain('id="platinum"');
    expect(html).not.toContain('id="startup"');
    expect(html).not.toContain('id="patron"');
    // Scoped to the plan-grid region: the page also renders <article> tags in the
    // membership-dimensions panel and the first-90-days step grid, so counting across the
    // whole page (as a naive `html.match(/<article/g)` would) overcounts. The test's intent,
    // per its name, is "the plan grid itself has four cards."
    const planGridHtml =
      html.match(/<div class="plan-grid">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect((planGridHtml.match(/<article/g) ?? []).length).toBe(4);
    expect(html).toContain(bundles.en.Membership.sme.title);
    expect(html).toContain("mailto:contact@hkwtia.org");
    expect(html).toContain("HK$500");
    expect(html).toContain("HK$1,800");
    expect(html).toContain("HK$4,800");
    expect(html).toContain('href="/join?plan=individual"');
    expect(html).toContain('href="/join?plan=corporate"');
    expect(html).toContain('href="/join?plan=platinum"');
    expect(html).toContain(bundles.en.Membership.actions.payOnline);
    expect(html).not.toContain("25 seats");
    expect(html).not.toContain("HK$1,200");
    expect(html).not.toMatch(/WhatsApp updates|Priority WhatsApp|Dedicated WhatsApp/);
    for (const locale of ["en", "zh-HK"] as const) {
      const page = locale === "en" ? html : await renderMembership([community, startup, patron], locale);
      const planGrid = page.match(/<div class="plan-grid">([\s\S]*?)<\/div>/)?.[1] ?? "";
      expect(page).toContain(bundles[locale].Membership.actions.payOnline);
      const approvedIndividual = APPROVED_INDIVIDUAL_BENEFITS[locale];
      const approvedCorporate = APPROVED_CORPORATE_BENEFITS[locale];
      const approvedPlatinum = APPROVED_PLATINUM_BENEFITS[locale];
      expect(approvedIndividual).toHaveLength(3);
      expect(approvedCorporate).toHaveLength(6);
      expect(approvedPlatinum).toHaveLength(5);
      expect(bundles[locale].Membership.tierBenefits.individual).toEqual([...approvedIndividual]);
      expect(bundles[locale].Membership.tierBenefits.corporate).toEqual([...approvedCorporate]);
      expect(bundles[locale].Membership.tierBenefits.platinum).toEqual([...approvedPlatinum]);
      const cardItems = (code: string) => {
        const card = planGrid.match(new RegExp(`<article id="${code}">([\\s\\S]*?)<\\/article>`))?.[1] ?? "";
        return {
          card,
          items: [...card.matchAll(/<li>([^<]*)<\/li>/g)].map((match) =>
            match[1].replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", "\""),
          ),
        };
      };
      const individual = cardItems("individual");
      const corporate = cardItems("corporate");
      const platinum = cardItems("platinum");
      expect(individual.items).toEqual([...approvedIndividual]);
      expect(corporate.items).toEqual([...approvedCorporate]);
      expect(platinum.items).toEqual([...approvedPlatinum]);
      expect(individual.card.match(/<ul/g) ?? []).toHaveLength(1);
      expect(corporate.card.match(/<ul/g) ?? []).toHaveLength(1);
      expect(platinum.card.match(/<ul/g) ?? []).toHaveLength(1);
      const communityCard = cardItems("community");
      expect(communityCard.card, `${locale} community`).not.toContain("<ul");
      expect(communityCard.card, `${locale} community`).not.toContain("<li");
      const rendered = new Set<string>([...approvedIndividual, ...approvedCorporate, ...approvedPlatinum]);
      for (const code of ["community", "startup", "patron"] as const) {
        const lines = bundles[locale].Membership.tierBenefits[code];
        const description = bundles[locale].Membership.tiers[code]?.description ?? "";
        for (const line of lines) {
          if (description.includes(line) || rendered.has(line)) continue;
          expect(page, `${locale} ${code}: ${line}`).not.toContain(line);
        }
      }
    }
  });

  it("shows the published pricing note with the ops fees", async () => {
    const html = await renderMembership([community, startup, corporate]);

    expect(html).toContain('class="pricing-note"');
    expect(html).toContain(bundles.en.Membership.pricing.readyCopy);
    expect(html).toContain("HK$4,800");
    expect(html).not.toContain("HK$1,200");
  });

  it("still shows the ops fees when the database catalog is empty", async () => {
    const html = await renderMembership([]);

    expect(html).toContain('class="plan-grid"');
    expect(html).toContain("HK$500");
    expect(html).toContain(bundles.en.Membership.pricing.readyCopy);
    expect(html).not.toContain("Membership is currently unavailable");
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
    expect((html.match(/<article/g) ?? []).length).toBeGreaterThanOrEqual(
      5 + 4,
    );
  });

  it("closes with /join and mailto: actions", async () => {
    const html = await renderMembership([community]);

    expect(html).toContain('href="/join"');
    expect(html).toMatch(/href="mailto:[^"]+"/);
  });
});
