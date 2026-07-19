import {z} from "zod";

const stringList = z.array(z.string().min(1)).max(20).default([]);

export const segmentFilterSchema = z.object({
  tier: stringList,
  status: stringList,
  scoreMin: z.coerce.number().min(0).max(100).nullable().default(null),
  scoreMax: z.coerce.number().min(0).max(100).nullable().default(null),
  renewalWithinDays: z.coerce.number().int().min(0).max(730).nullable().default(null),
  sector: z.string().trim().max(100).default(""),
  lastLoginBeforeDays: z.coerce.number().int().min(0).max(3650).nullable().default(null),
}).strict().superRefine((filter, context) => {
  if (filter.scoreMin !== null && filter.scoreMax !== null && filter.scoreMin > filter.scoreMax) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["scoreMax"], message: "scoreMax must be at least scoreMin"});
  }
});

export type SegmentFilterSet = z.infer<typeof segmentFilterSchema>;

export const segmentPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().max(500).nullable().default(null),
}).strict();

export type SegmentPagination = z.infer<typeof segmentPaginationSchema>;

export const segmentPreviewSchema = z.object({
  filter: segmentFilterSchema,
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().max(500).nullable().default(null),
}).strict();

export type SegmentPreviewInput = z.infer<typeof segmentPreviewSchema>;

export const segmentSaveSchema = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().max(120).nullable().default(null),
  filter: segmentFilterSchema,
}).strict();

export type SegmentSaveInput = z.infer<typeof segmentSaveSchema>;

export const segmentIdSchema = z.string().uuid();

const queryListSchema = z.union([z.string(), z.array(z.string())]).optional().transform((value) => value === undefined ? [] : (Array.isArray(value) ? value : [value]));

export const segmentRouteQuerySchema = z.object({
  tier: queryListSchema,
  status: queryListSchema,
  scoreMin: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  scoreMax: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  renewalWithinDays: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  sector: z.string().optional().default(""),
  lastLoginBeforeDays: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  limit: z.union([z.string(), z.number()]).optional().default(50),
  cursor: z.string().nullable().optional().default(null),
}).strict().transform(({tier, status, scoreMin, scoreMax, renewalWithinDays, sector, lastLoginBeforeDays, limit, cursor}): SegmentPreviewInput => ({
  filter: segmentFilterSchema.parse({tier, status, scoreMin, scoreMax, renewalWithinDays, sector, lastLoginBeforeDays}),
  limit: segmentPaginationSchema.shape.limit.parse(limit),
  cursor: segmentPaginationSchema.shape.cursor.parse(cursor),
}));

export function parseSegmentRouteQuery(input: unknown): SegmentPreviewInput {
  return segmentRouteQuerySchema.parse(input);
}
