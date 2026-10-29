import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {opsTier} from "@/config/membership-journey";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {getDb} from "@/lib/db/repos/common";
import {membershipPlans} from "@/lib/db/server-schema";

/** 0069 adds enum values only; bootstrap their FK targets in the caller's transaction. */
export async function ensureOpsMembershipPlan(
  database: {execute: (query: SQL) => PromiseLike<unknown>},
  code: MembershipPlanCode,
): Promise<void> {
  if (code !== "individual" && code !== "platinum") return;
  const tier = opsTier(code);
  await database.execute(sql`
    INSERT INTO ${membershipPlans} (code, audience, billing_behavior, seat_allowance, annual_price_hkd, active)
    VALUES (${code}, ${code}, 'checkout', ${tier.collectsCompany ? 25 : 1}, ${tier.annualPriceHkd}, true)
    ON CONFLICT (code) DO NOTHING
  `);
}

export type PersistedMembershipPlan = Readonly<{
  code: string;
  audience: string;
  billingBehavior: string;
  seatAllowance: number;
  active: boolean;
  annualPriceHkd: number | null;
  monthlyPriceHkd: number | null;
  stripePriceReference: string | null;
}>;

export const membershipPlansRepository = {
  async list(): Promise<readonly PersistedMembershipPlan[]> {
    const database = await getDb();
    return database
      .select({
        code: membershipPlans.code,
        audience: membershipPlans.audience,
        billingBehavior: membershipPlans.billingBehavior,
        seatAllowance: membershipPlans.seatAllowance,
        active: membershipPlans.active,
        annualPriceHkd: membershipPlans.annualPriceHkd,
        monthlyPriceHkd: membershipPlans.monthlyPriceHkd,
        stripePriceReference: membershipPlans.stripePriceReference,
      })
      .from(membershipPlans);
  },
};
