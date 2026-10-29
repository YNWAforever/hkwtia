import "server-only";

import {eq} from "drizzle-orm";
import {z} from "zod";

import type {BrContentType} from "@/config/membership-journey";
import {auditEvents, membershipApplications, organisationApplicationDetails} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

const detailSchema = z.object({
  applicationId: z.string().uuid(),
  tier: z.enum(["corporate", "patron"]),
  primaryName: z.string().trim().min(1).max(160),
  primaryEmail: z.string().trim().email().max(254),
  primaryPhone: z.string().trim().max(64).nullable(),
  secondaryName: z.string().trim().min(1).max(160),
  secondaryEmail: z.string().trim().email().max(254),
  secondaryPhone: z.string().trim().max(64).nullable(),
  br: z.object({
    status: z.enum(["stored", "pending_provider"]),
    key: z.string().trim().min(1).max(300).nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().min(1).max(8_388_608),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    fileName: z.string().trim().min(1).max(180),
  }),
}).superRefine((input, context) => {
  const stored = input.br.status === "stored";
  if (stored !== Boolean(input.br.key)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["br", "key"], message: "BR_STORAGE_STATUS"});
  }
});

export type OrganisationApplicationInput = z.input<typeof detailSchema>;

/**
 * Applicant-owned write. The repository checks the application owner itself;
 * the join action is not the authorization gate.
 * Audit metadata is the hash and storage status, never the file bytes.
 */
export async function saveOrganisationApplication(actor: Actor, raw: OrganisationApplicationInput): Promise<void> {
  requireMember(actor);
  const input = detailSchema.parse(raw);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [application] = await tx.select({
      id: membershipApplications.id,
      applicantUserId: membershipApplications.applicantUserId,
      planCode: membershipApplications.planCode,
    }).from(membershipApplications).where(eq(membershipApplications.id, input.applicationId)).limit(1);
    if (!application || application.applicantUserId !== actor.profileId || application.planCode !== input.tier) {
      throw new Error("APPLICATION_NOT_FOUND");
    }
    const row = {
      applicationId: input.applicationId,
      tierCode: input.tier,
      primaryName: input.primaryName,
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone,
      secondaryName: input.secondaryName,
      secondaryEmail: input.secondaryEmail,
      secondaryPhone: input.secondaryPhone,
      brFileName: input.br.fileName,
      brContentType: input.br.contentType satisfies BrContentType,
      brByteSize: input.br.byteSize,
      brSha256: input.br.sha256,
      brStorageKey: input.br.key,
      brStorageStatus: input.br.status,
      updatedAt: new Date(),
    };
    await tx.insert(organisationApplicationDetails).values(row).onConflictDoUpdate({
      target: organisationApplicationDetails.applicationId,
      set: row,
    });
    await tx.insert(auditEvents).values({
      actorUserId: actor.profileId,
      actorType: "member",
      action: "membership.organisation_application.saved",
      targetType: "membership_application",
      targetId: input.applicationId,
      metadata: {
        tier: input.tier,
        brStorageStatus: input.br.status,
        brSha256: input.br.sha256,
        brByteSize: input.br.byteSize,
        brContentType: input.br.contentType,
      },
    });
  });
}
