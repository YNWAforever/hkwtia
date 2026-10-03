import "server-only";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import { updateApplicationCaseInTransaction } from "@/lib/db/repos/applications";
import type { Actor } from "@/lib/membership/lifecycle";
import { applicationsRepository } from "@/lib/db/repos/applications";
import {
  applicationCasePatchSchema,
  type ApplicationCasePatch,
} from "@/lib/admin/application-case-types";
export async function updateApplicationCase(
  actor: Actor,
  id: string,
  patch: ApplicationCasePatch,
): Promise<{
  version: string;
}> {
  return applicationsRepository.updateApplicationCase(
    actor,
    id,
    applicationCasePatchSchema.parse(patch),
  );
}

export function getApplicationTriage(actor: Actor, id: string) {
  return applicationsRepository.getApplicationTriage(actor, id);
}

const adoptionInput = z
  .object({
    draftId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    expectedCaseVersion: z.union([z.literal("0"), z.string().uuid()]),
  })
  .strict();
export function createApplicationDraftAdoptionService(
  drafts: Pick<typeof aiDraftsRepository, "withApprovedDraft">,
) {
  return {
    async adoptApplicationDraft(actor: Actor, id: string, input: unknown) {
      requireAdmin(actor);
      const applicationId = z.string().uuid().parse(id),
        value = adoptionInput.parse(input);
      return drafts.withApprovedDraft(
        actor,
        { draftId: value.draftId, expectedVersion: value.expectedVersion },
        async (tx, draft, renderedBody) => {
          if (draft.kind !== "application" || draft.caseId !== applicationId)
            throw Error("APPLICATION_DRAFT_CASE_MISMATCH");
          // Adoption is a staff follow-up note. It cannot change owner, due, missing fields,
          // membership, payment, or queue a message. The existing 1000-character limit applies.
          return updateApplicationCaseInTransaction(
            actor,
            applicationId,
            { expectedVersion: value.expectedCaseVersion, note: renderedBody },
            tx,
          );
        },
      );
    },
  };
}
export const { adoptApplicationDraft } =
  createApplicationDraftAdoptionService(aiDraftsRepository);
