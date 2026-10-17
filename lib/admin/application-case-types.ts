import "server-only";
import { z } from "zod";
export const APPLICATION_MISSING_FIELDS = ["displayName", "phone", "companyName", "companyWebsite", "companySize", "businessDescription"] as const;
export const APPLICATION_NEXT_ACTIONS = ["none", "contact_applicant", "await_documents", "review_ready", "await_payment", "support_reconciliation", "follow_up_complete"] as const;
const versionSchema = z.union([z.literal("0"), z.string().uuid()]);
const missingSchema = z.array(z.enum(APPLICATION_MISSING_FIELDS)).max(APPLICATION_MISSING_FIELDS.length).refine(values => new Set(values).size === values.length);
export const applicationCasePatchSchema = z.object({
    expectedVersion: versionSchema,
    ownerProfileId: z.string().trim().min(1).max(255).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    missingFields: missingSchema.optional(),
    nextActionCode: z.enum(APPLICATION_NEXT_ACTIONS).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
}).strict().refine(value => Object.keys(value).length > 1, "CASE_CHANGE_REQUIRED");
export const applicationCaseContextSchema = z.object({
    applicationId: z.string().uuid(), caseVersion: z.string().uuid(),
    ownerProfileId: z.string().min(1).max(255).nullable(), dueAt: z.string().datetime({ offset: true }).nullable(),
    missingFields: missingSchema, nextActionCode: z.enum(APPLICATION_NEXT_ACTIONS),
}).strict();
export type ApplicationCasePatch = z.infer<typeof applicationCasePatchSchema>;
export type ApplicationCaseContext = z.infer<typeof applicationCaseContextSchema>;
export type ApplicationCase = Readonly<{
    profile: Readonly<{
        email: string | null;
        phone: string | null;
        jobTitle: string | null;
        locale: string;
        onboardingState: string;
    }>;
    company: Readonly<{
        id: string;
        legalName: string;
        displayName: string;
        website: string | null;
        industry: string | null;
        sizeBand: string | null;
        description: string | null;
    }> | null;
    application: Readonly<{
        id: string;
        profileId: string;
        name: string;
        companyId: string | null;
        companyName: string | null;
        planCode: string;
        status: string;
        step: string;
        createdAt: string;
        updatedAt: string;
    }>;
    membership: Readonly<{
        id: string;
        status: string;
    }> | null;
    payment: Readonly<{
        attemptId: string;
        state: string;
    }> | null;
    version: string;
    ownerProfileId: string | null;
    dueAt: string | null;
    missingFields: readonly string[];
    nextActionCode: string;
    timeline: readonly Readonly<{
        id: string;
        at: string;
        actorType: string;
        actorUserId: string | null;
        actorName: string | null;
        note: string | null;
        case: ApplicationCaseContext;
    }>[];
}>;
