import { z } from "zod";
import { knowledgeRefSchema } from "@/lib/ai/knowledge/contracts";
export const draftKinds = [
  "application",
  "support",
  "renewal",
  "board",
  "content",
] as const;
export const factValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const fieldSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_.-]{0,63}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
export const approvedFactPackSchema = z
  .object({
    caseId: z.string().min(1).max(255),
    locale: z.enum(["en", "zh-HK"]),
    versionHash: z.string().regex(/^[a-f0-9]{64}$/),
    asOf: z.string().datetime({ offset: true }),
    values: z
      .record(
        fieldSchema,
        z
          .object({
            value: factValueSchema,
            sourceId: z.string().min(1).max(255),
            label: z.string().min(1).max(160),
            format: z.enum([
              "text",
              "money",
              "date",
              "count",
              "percent",
              "boolean",
            ]),
            currency: z.enum(["HKD", "USD"]).optional(),
          })
          .strict(),
      )
      .refine((v) => Object.keys(v).length <= 64),
    sourceRefs: z.array(knowledgeRefSchema).max(50),
    recordSources: z
      .record(
        z
          .string()
          .regex(
            /^db:(application|support|renewal|board|content|plan|membership|event|consent|profile):[a-zA-Z0-9_.:-]{1,180}$/,
          ),
        z.string().regex(/^[a-f0-9]{64}$/),
      )
      .refine((value) => Object.keys(value).length <= 64)
      .default({}),
    sourceUrls: z
      .record(z.string().min(1).max(255), z.string().url().max(2000))
      .default({}),
    displayLabels: z
      .object({
        yes: z.string().min(1).max(120),
        no: z.string().min(1).max(120),
        notAvailable: z.string().min(1).max(120),
      })
      .strict(),
    comparisonAvailable: z.boolean().nullable().default(null),
  })
  .strict();
export type ApprovedFactPack = z.infer<typeof approvedFactPackSchema>;
export const groundedContentSchema = z
  .object({
    body: z.string().min(1).max(20000),
    claims: z
      .array(
        z
          .object({
            field: fieldSchema,
            value: factValueSchema,
            sourceId: z.string().min(1).max(255),
          })
          .strict(),
      )
      .max(64),
    sourceRefs: z.array(knowledgeRefSchema).max(50),
  })
  .strict();
export type GroundedContent = z.infer<typeof groundedContentSchema>;
export const adminAiDraftSchema = groundedContentSchema
  .extend({
    id: z.string().uuid(),
    version: z.number().int().positive().max(2147483647),
    kind: z.enum(draftKinds),
    caseId: z.string().min(1).max(255),
    factsHash: z.string().regex(/^[a-f0-9]{64}$/),
    ownerId: z.string().min(1).max(255).nullable(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    state: z.enum([
      "proposed",
      "needs_review",
      "approved",
      "rejected",
      "stale",
    ]),
    modelRoute: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(80),
    runId: z.string().uuid(),
  })
  .strict();
export type AdminAiDraft = z.infer<typeof adminAiDraftSchema>;
export type DraftViolation = Readonly<{
  field: string;
  code: string;
}>;
export type DraftValidation = Readonly<{
  valid: boolean;
  violations: readonly DraftViolation[];
}>;
