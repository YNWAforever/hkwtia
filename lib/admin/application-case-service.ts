import "server-only";
import type { Actor } from "@/lib/membership/lifecycle";
import { applicationsRepository } from "@/lib/db/repos/applications";
import { applicationCasePatchSchema, type ApplicationCasePatch } from "@/lib/admin/application-case-types";
export async function updateApplicationCase(actor: Actor, id: string, patch: ApplicationCasePatch): Promise<{
    version: string;
}> {
    return applicationsRepository.updateApplicationCase(actor, id, applicationCasePatchSchema.parse(patch));
}
