import {adminMemberQuerySchema, type AdminMemberQuery} from "@/lib/admin/member-query";
import {addHongKongDays, hongKongDateKey} from "@/lib/automation/hong-kong-time";

export type MemberPresetId = "active" | "due30" | "due60" | "due90" | "pastDue" | "expired" | "missingData";

/** Views describe records. They do not change benefit eligibility or payment policy. */
export function memberPresetQueries(now: Date): Record<MemberPresetId, AdminMemberQuery> {
  const today = hongKongDateKey(now);
  const due = (days: number) => adminMemberQuerySchema.parse({status: ["active", "cancel_at_period_end"], renewalFrom: today, renewalTo: hongKongDateKey(addHongKongDays(now, days)), sort: "renewal_asc"});
  return {
    active: adminMemberQuerySchema.parse({status: ["active"]}),
    due30: due(30), due60: due(60), due90: due(90),
    pastDue: adminMemberQuerySchema.parse({status: ["past_due"]}),
    expired: adminMemberQuerySchema.parse({status: ["expired"]}),
    missingData: adminMemberQuerySchema.parse({completeness: "incomplete"}),
  };
}
