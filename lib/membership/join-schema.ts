import "server-only";

import {z} from "zod";

import {PLAN_CODES, type PlanCode} from "@/lib/membership/plans";
import {BILLING_INTERVALS} from "@/lib/membership/catalog";

export const planCodeSchema = z.enum(PLAN_CODES);

const applicationIdSchema = z.string().trim().min(1).max(128).nullable().optional().default(null);

/** Input accepted by the first join step and safe to persist as a draft key. */
export const joinInputSchema = z.object({
  plan: planCodeSchema,
  applicationId: applicationIdSchema,
});

export type JoinInput = z.infer<typeof joinInputSchema> & {plan: PlanCode};

export const profileSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  displayName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(64).optional().nullable(),
  jobTitle: z.string().trim().max(160).optional().nullable(),
  locale: z.string().trim().max(10).optional(),
});

export const companySchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  legalName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).optional().nullable(),
  industry: z.string().trim().max(160).optional().nullable(),
  sizeBand: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const completeApplicationSchema = z.object({
  plan: planCodeSchema,
  applicationId: applicationIdSchema,
  // Caller-supplied and validated against the membership catalog (lib/membership/catalog.ts)
  // before any mutation -- see completeApplication() in lib/membership/onboarding.ts. No
  // default here: a real caller must always state the interval it wants, never inherit one
  // silently derived by the server.
  billingInterval: z.enum(BILLING_INTERVALS),
  profile: profileSchema,
  company: companySchema.nullable().optional().default(null),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type CompleteApplicationInput = z.infer<typeof completeApplicationSchema> & {plan: PlanCode};

// Friendly aliases keep callers from coupling to a particular schema name.
export const joinSchema = joinInputSchema;
export const completeJoinSchema = completeApplicationSchema;
