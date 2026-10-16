import "server-only";
import { z } from "zod";
import { AuthorizationError, requireMember, type Actor } from "@/lib/membership/lifecycle";
import type { PlanCode } from "@/lib/membership/plans";
import { applicationsRepository } from "@/lib/db/repos/applications";
import { profilesRepository } from "@/lib/db/repos/profiles";
import { companiesRepository } from "@/lib/db/repos/companies";
/** Read only the authenticated applicant's saved join data. Company seats do
 * not let one applicant resume another applicant's draft. Failed reads throw.
 */
export async function getJoinDraft(actor: Actor, plan: PlanCode, applicationId: string | null) {
    requireMember(actor);
    try {
        if (applicationId && !z.string().uuid().safeParse(applicationId).success)
            return null;
        const application = applicationId ? await applicationsRepository.getById(actor, applicationId) : null;
        if (applicationId && (!application || application.applicantUserId !== actor.profileId || application.planCode !== plan))
            return null;
        const profile = await profilesRepository.getById(actor, actor.profileId);
        const company = application?.companyId ? await companiesRepository.getById(actor, application.companyId) : null;
        if (application?.companyId && !company)
            return null;
        return { application, profile, company };
    }
    catch (error) {
        if (error instanceof AuthorizationError)
            return null;
        throw error;
    }
}
