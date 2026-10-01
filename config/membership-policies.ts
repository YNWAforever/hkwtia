import "server-only";
import type { MembershipPolicy } from "@/lib/membership/policy";
// Add only versions backed by a WTIA approval reference. Test policies belong
// in test fixtures. No association policy was approved by the implementation plan.
export const MEMBERSHIP_POLICIES: readonly MembershipPolicy[] = [];
