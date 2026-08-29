import "server-only";

import {getDb} from "@/lib/db/repos/common";
import {membershipPlans} from "@/lib/db/server-schema";

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
