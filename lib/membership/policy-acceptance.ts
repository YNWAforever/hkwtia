import "server-only";
import { policyAcceptanceEnabled, requireCurrentMembershipPolicy } from "@/lib/membership/policy";
import { membershipPolicyAcceptancesRepository } from "@/lib/db/repos/membership-policy-acceptances";
import type { Actor } from "@/lib/membership/lifecycle";
export async function requirePolicyAcceptanceForApplication(actor: Actor, applicationId: string | null | undefined): Promise<void> {
    if (!policyAcceptanceEnabled())
        return;
    requireCurrentMembershipPolicy();
    if (!applicationId || !await membershipPolicyAcceptancesRepository.hasCurrentAcceptance(actor, applicationId))
        throw Error("MEMBERSHIP_POLICY_ACCEPTANCE_REQUIRED");
}
