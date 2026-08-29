import {describe, expect, it} from "vitest";

import {
  buildPublicMembershipCatalog,
  publicPriceIds,
  type PersistedMembershipPlan,
} from "@/lib/membership/public-catalog";

const priceIds = {startup: "price_startup", corporate: "price_corporate"} as const;

const validRows = [
  {
    code: "community",
    audience: "individual",
    billingBehavior: "free",
    seatAllowance: 1,
    active: true,
    annualPriceHkd: 0,
    monthlyPriceHkd: null,
    stripePriceReference: null,
  },
  {
    code: "startup",
    audience: "startup",
    billingBehavior: "checkout",
    seatAllowance: 5,
    active: true,
    annualPriceHkd: 1200,
    monthlyPriceHkd: 120,
    stripePriceReference: priceIds.startup,
  },
  {
    code: "corporate",
    audience: "corporate",
    billingBehavior: "checkout",
    seatAllowance: 25,
    active: true,
    annualPriceHkd: 1800,
    monthlyPriceHkd: null,
    stripePriceReference: priceIds.corporate,
  },
  {
    code: "patron",
    audience: "patron",
    billingBehavior: "review",
    seatAllowance: 1,
    active: true,
    annualPriceHkd: 25000,
    monthlyPriceHkd: 2500,
    stripePriceReference: null,
  },
] satisfies PersistedMembershipPlan[];

function startup(overrides: Partial<PersistedMembershipPlan> = {}): PersistedMembershipPlan {
  return {...validRows[1], ...overrides};
}

function catalog(rows: readonly PersistedMembershipPlan[], locale: "en" | "zh-HK" = "en") {
  return buildPublicMembershipCatalog({locale, rows, priceIds});
}

describe("public Membership catalog", () => {
  it("keeps canonical plan order regardless of persisted row order and ignores unknown rows", () => {
    const unknown = {...validRows[0], code: "legacy"};

    expect(catalog([...validRows].reverse().concat(unknown)).map((tier) => tier.code))
      .toEqual(["community", "startup", "corporate", "patron"]);
  });

  it("omits duplicated, inactive, malformed, and structurally mismatched canonical rows", () => {
    const rows = [
      validRows[0],
      startup(),
      startup(),
      {...validRows[2], active: false},
      {...validRows[3], annualPriceHkd: Number.NaN},
      {...validRows[0], code: "unknown"},
    ];

    expect(catalog(rows).map((tier) => tier.code)).toEqual(["community"]);
  });

  it.each([
    ["audience", {audience: "individual"}],
    ["billing behavior", {billingBehavior: "review"}],
    ["seat allowance", {seatAllowance: 25}],
    ["active flag", {active: false}],
  ] as const)("requires exact PLAN_CATALOG %s matching", (_label, mismatch) => {
    expect(catalog([startup(mismatch)])).toEqual([]);
  });

  it.each([-1, 2147483648, 1.5])("rejects non-Postgres-integer annual value %s", (annualPriceHkd) => {
    expect(catalog([startup({annualPriceHkd})])).toEqual([]);
  });

  it.each([-1, 2147483648, 1.5, 0])("rejects invalid paid monthly value %s", (monthlyPriceHkd) => {
    expect(catalog([startup({monthlyPriceHkd})])).toEqual([]);
  });

  it("enforces the semantic Community and Patron price and CTA rules", () => {
    expect(catalog([validRows[0], validRows[3]])).toEqual([
      {code: "community", price: {kind: "free"}, cta: {href: "/join?plan=community", kind: "join"}},
      {code: "patron", price: {kind: "review"}, cta: {href: "/contact", kind: "contact"}},
    ]);
    expect(catalog([{...validRows[0], monthlyPriceHkd: 1}])).toEqual([]);
    expect(catalog([{...validRows[3], monthlyPriceHkd: -1}])).toEqual([]);
  });

  it("derives annual then monthly paid options from their persisted fields", () => {
    const [tier] = catalog([startup()]);
    const money = new Intl.NumberFormat("en", {style: "currency", currency: "HKD"});

    expect(tier).toEqual({
      code: "startup",
      price: {
        kind: "paid",
        options: [
          {amount: money.format(1200), cadence: "annual"},
          {amount: money.format(120), cadence: "monthly"},
        ],
      },
      cta: {href: "/join?plan=startup", kind: "join"},
    });
  });

  it("uses the requested locale to format persisted paid values", () => {
    const [tier] = catalog([startup({monthlyPriceHkd: null})], "zh-HK");
    const money = new Intl.NumberFormat("zh-HK", {style: "currency", currency: "HKD"});

    expect(tier.price).toEqual({
      kind: "paid",
      options: [{amount: money.format(1200), cadence: "annual"}],
    });
  });

  it.each([
    ["missing configured ID", {startup: "", corporate: priceIds.corporate}, priceIds.startup],
    ["missing row reference", priceIds, null],
    ["similar row reference", priceIds, `${priceIds.startup}_other`],
    ["different configured ID", {startup: "price_other", corporate: priceIds.corporate}, priceIds.startup],
  ] as const)("omits a paid plan for %s", (_label, configured, stripePriceReference) => {
    expect(buildPublicMembershipCatalog({
      locale: "en",
      rows: [startup({stripePriceReference})],
      priceIds: configured,
    })).toEqual([]);
  });

  it("reads, trims, and returns only the two public eligibility price IDs", () => {
    const result = publicPriceIds({
      NODE_ENV: "test",
      STRIPE_STARTUP_PRICE_ID: "  price_startup  ",
      STRIPE_CORPORATE_PRICE_ID: " price_corporate ",
      STRIPE_SECRET_KEY: "dummy-private-sentinel",
    });

    expect(result).toEqual(priceIds);
    expect(JSON.stringify(result)).not.toContain("dummy-private-sentinel");
    expect(Object.keys(result)).toEqual(["startup", "corporate"]);
  });

  it("never serializes persisted Stripe references or unrelated environment values", () => {
    const serialized = JSON.stringify(catalog(validRows));

    expect(serialized).not.toContain("stripePriceReference");
    expect(serialized).not.toContain(priceIds.startup);
    expect(serialized).not.toContain(priceIds.corporate);
    expect(serialized).not.toContain("stripeSecretKey");
  });
});
