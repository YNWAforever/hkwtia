import "server-only";

import type {AppLocale} from "@/i18n/routing";
import type {PersistedMembershipPlan} from "@/lib/db/repos/membership-plans";
import {PLAN_CATALOG, PLAN_CODES, type PlanCode} from "@/lib/membership/plans";

export type {PersistedMembershipPlan} from "@/lib/db/repos/membership-plans";

export type PublicMembershipPrice =
  | Readonly<{kind: "free"}>
  | Readonly<{kind: "review"}>
  | Readonly<{
      kind: "paid";
      options: readonly Readonly<{amount: string; cadence: "annual" | "monthly"}>[];
    }>;

export type PublicMembershipTier = Readonly<{
  code: PlanCode;
  price: PublicMembershipPrice;
  cta: Readonly<{
    href: "/join?plan=community" | "/join?plan=startup" | "/join?plan=corporate" | "/contact";
    kind: "join" | "contact";
  }>;
}>;

const POSTGRES_INTEGER_MAX = 2147483647;

export function publicPriceIds(environment: NodeJS.ProcessEnv = process.env) {
  return {
    startup: (environment.STRIPE_STARTUP_PRICE_ID ?? "").trim(),
    corporate: (environment.STRIPE_CORPORATE_PRICE_ID ?? "").trim(),
  };
}

function isPostgresIntegerOrNull(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= POSTGRES_INTEGER_MAX);
}

function structurallyMatches(row: PersistedMembershipPlan, code: PlanCode): boolean {
  const expected = PLAN_CATALOG[code];
  return row.code === expected.code
    && row.audience === expected.audience
    && row.billingBehavior === expected.billingBehavior
    && row.seatAllowance === expected.seatAllowance
    && row.active === expected.active
    && isPostgresIntegerOrNull(row.annualPriceHkd)
    && isPostgresIntegerOrNull(row.monthlyPriceHkd);
}

function paidTier(
  code: "startup" | "corporate",
  row: PersistedMembershipPlan,
  configuredPriceId: string,
  money: Intl.NumberFormat,
): PublicMembershipTier | null {
  if (configuredPriceId.length === 0 || configuredPriceId !== configuredPriceId.trim()) return null;
  if (row.stripePriceReference !== configuredPriceId) return null;
  if (row.annualPriceHkd === null || row.annualPriceHkd <= 0) return null;
  if (row.monthlyPriceHkd !== null && row.monthlyPriceHkd <= 0) return null;

  const options: Array<Readonly<{amount: string; cadence: "annual" | "monthly"}>> = [
    {amount: money.format(row.annualPriceHkd), cadence: "annual"},
  ];
  if (row.monthlyPriceHkd !== null) {
    options.push({amount: money.format(row.monthlyPriceHkd), cadence: "monthly"});
  }

  return {
    code,
    price: {kind: "paid", options},
    cta: code === "startup"
      ? {href: "/join?plan=startup", kind: "join"}
      : {href: "/join?plan=corporate", kind: "join"},
  };
}

export function buildPublicMembershipCatalog(input: Readonly<{
  locale: AppLocale;
  rows: readonly PersistedMembershipPlan[];
  priceIds: Readonly<{startup: string; corporate: string}>;
}>): readonly PublicMembershipTier[] {
  const money = new Intl.NumberFormat(input.locale, {style: "currency", currency: "HKD"});
  const tiers: PublicMembershipTier[] = [];

  for (const code of PLAN_CODES) {
    const matches = input.rows.filter((row) => row?.code === code);
    if (matches.length !== 1) continue;

    const row = matches[0];
    if (!structurallyMatches(row, code)) continue;

    if (code === "community") {
      if ((row.annualPriceHkd === null || row.annualPriceHkd === 0)
        && (row.monthlyPriceHkd === null || row.monthlyPriceHkd === 0)) {
        tiers.push({
          code,
          price: {kind: "free"},
          cta: {href: "/join?plan=community", kind: "join"},
        });
      }
      continue;
    }

    if (code === "patron") {
      tiers.push({
        code,
        price: {kind: "review"},
        cta: {href: "/contact", kind: "contact"},
      });
      continue;
    }

    const tier = paidTier(code, row, input.priceIds[code], money);
    if (tier) tiers.push(tier);
  }

  return tiers;
}
