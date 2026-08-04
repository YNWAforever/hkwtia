import {z} from "zod";

const cohortStatuses = ["planning", "open", "active", "completed", "archived"] as const;
const cohortStages = [
  "applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected",
] as const;
const landingPartnerMouStatuses = ["prospect", "in_discussion", "signed", "inactive"] as const;

const readinessValueSchema = z.union([
  z.string().trim().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const cohortStageSchema = z.enum(cohortStages);

export const cohortApplicationInputSchema = z.object({
  cohortId: z.string().uuid(),
  readiness: z.record(z.string().trim().min(1).max(64), readinessValueSchema)
    .refine((value) => Object.keys(value).length <= 12, {
      message: "readiness must contain at most 12 answers",
    }),
}).strict();

export const publicCohortSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(200),
  nameZhHk: z.string().trim().min(1).max(200),
  descriptionEn: z.string().trim().min(1).max(4_000),
  descriptionZhHk: z.string().trim().min(1).max(4_000),
  track: z.string().trim().min(1).max(160),
  startsOn: z.string().date(),
  endsOn: z.string().date().nullable(),
  capacity: z.number().int().positive(),
  feeHkd: z.number().int().nonnegative(),
  status: z.enum(cohortStatuses),
}).strict();

export const publicLandingPartnerSchema = z.object({
  id: z.string().uuid(),
  organizationEn: z.string().trim().min(1).max(200),
  organizationZhHk: z.string().trim().min(1).max(200),
  market: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  mouStatus: z.enum(landingPartnerMouStatuses),
}).strict();

export function parseCohortStage(input: unknown) {
  return cohortStageSchema.parse(input);
}

export function parseCohortApplicationInput(input: unknown) {
  return cohortApplicationInputSchema.parse(input);
}

export type CohortStage = z.infer<typeof cohortStageSchema>;
export type CohortApplicationInput = z.infer<typeof cohortApplicationInputSchema>;
export type PublicCohort = z.infer<typeof publicCohortSchema>;
export type PublicLandingPartner = z.infer<typeof publicLandingPartnerSchema>;
