import "server-only";
import { z } from "zod";
import { AuthorizationError, type Actor } from "@/lib/membership/lifecycle";
import type { AppLocale } from "@/i18n/routing";
import { applicationsRepository } from "@/lib/db/repos/applications";
import { membershipPolicyAcceptancesRepository } from "@/lib/db/repos/membership-policy-acceptances";
import { currentMembershipPolicy, policyAcceptanceEnabled } from "@/lib/membership/policy";
export type PolicyConfirmationView = Readonly<{
    enabled: boolean;
    policy: Readonly<{
        version: string;
        content: string;
    }> | null;
    needsAcceptance: boolean;
    canProceed: boolean;
    ownerRequired: boolean;
}>;
export async function getPolicyConfirmation(actor: Actor, applicationId: string | null | undefined, locale: AppLocale): Promise<PolicyConfirmationView> {
    if (!policyAcceptanceEnabled())
        return { enabled: false, policy: null, needsAcceptance: false, canProceed: true, ownerRequired: false };
    const approved = currentMembershipPolicy();
    if (!approved)
        return { enabled: true, policy: null, needsAcceptance: false, canProceed: false, ownerRequired: false };
    const policy = { version: approved.version, content: approved.localeContent[locale] };
    if (actor.kind !== "member")
        return { enabled: true, policy, needsAcceptance: false, canProceed: false, ownerRequired: true };
    if (!applicationId)
        return { enabled: true, policy, needsAcceptance: true, canProceed: true, ownerRequired: false };
    if (!z.string().uuid().safeParse(applicationId).success)
        return { enabled: true, policy, needsAcceptance: false, canProceed: false, ownerRequired: true };
    try {
        const application = await applicationsRepository.getById(actor, applicationId);
        if (!application)
            return { enabled: true, policy, needsAcceptance: false, canProceed: false, ownerRequired: true };
        const accepted = await membershipPolicyAcceptancesRepository.hasCurrentAcceptance(actor, applicationId);
        const owner = application.applicantUserId === actor.profileId;
        return { enabled: true, policy, needsAcceptance: owner && !accepted, canProceed: owner || accepted, ownerRequired: !owner && !accepted };
    }
    catch (error) {
        if (error instanceof AuthorizationError)
            return { enabled: true, policy, needsAcceptance: false, canProceed: false, ownerRequired: true };
        throw error; // A failed DB read is not a missing/accepted policy.
    }
}
