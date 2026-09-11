import {z} from "zod";

import {isIndustryTag} from "@/config/industry-tags";
import {CONTACT_SOURCES, CONTACT_STAGES} from "@/lib/db/repos/contacts";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

const stringList = z.array(z.string().min(1)).max(20).default([]);
const profileIdList = z.array(z.string().trim().min(1).max(200)).max(20).default([]);

function nullableNumber(schema: z.ZodNumber) {
  return z.preprocess((value) => typeof value === "string" && value.trim() === "" ? null : value, schema.nullable().default(null));
}

// Phase A segment v1.5 (audit F11): "" / undefined mean "any", so a saved
// filter_version 1 segment and a blank <select> both parse to null.
const triStateBoolean = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().nullable().default(null));

/** The current `saved_segments.filter_version`. One name, so writer and dispatcher cannot drift (S-9). */
export const SEGMENT_FILTER_VERSION = 2;

/**
 * S-10. `no_show` is deliberately absent: it exists on `registration_status`
 * and not on `guest_registration_status`, so a segment asking for it would mean
 * one thing for members and nothing at all for contacts — a filter that lies.
 */
export const SEGMENT_EVENT_STATES = ["registered", "waitlist", "attended", "cancelled", "not_registered"] as const;
export const SEGMENT_AUDIENCES = ["members", "contacts", "both"] as const;

/**
 * v1 is frozen. It is the exact shape every `filter_version = 1` row in
 * `saved_segments` was written with, and `.strict()` is what makes a row that
 * has somehow acquired a key from a later version throw instead of being
 * half-read into a filter that quietly matches the wrong people.
 */
const segmentFilterV1Object = z.object({
  profileIds: profileIdList,
  tier: stringList,
  status: stringList,
  scoreMin: nullableNumber(z.coerce.number().min(0).max(100)),
  scoreMax: nullableNumber(z.coerce.number().min(0).max(100)),
  renewalWithinDays: nullableNumber(z.coerce.number().int().min(0).max(730)),
  sector: z.string().trim().max(100).default(""),
  lastLoginBeforeDays: nullableNumber(z.coerce.number().int().min(0).max(3650)),
  whatsappOptIn: triStateBoolean,
}).strict();

function refineScoreRange(filter: Readonly<{scoreMin: number | null; scoreMax: number | null}>, context: z.RefinementCtx): void {
  if (filter.scoreMin !== null && filter.scoreMax !== null && filter.scoreMin > filter.scoreMax) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["scoreMax"], message: "scoreMax must be at least scoreMin"});
  }
}

export const segmentFilterV1Schema = segmentFilterV1Object.superRefine(refineScoreRange);

/**
 * v2 is v1 plus six keys, every one of them defaulted, so a stored v1 object
 * read through `parseSegmentFilter(1, …)` lands on this shape without a
 * backfill. Each new vocabulary is closed and imported from its one owner —
 * a free-text tag is unreachable from `companies.tags @> ARRAY['ai']`, which is
 * the bug `config/industry-tags.ts` exists to prevent.
 */
const segmentFilterV2Object = segmentFilterV1Object.extend({
  industryTags: z.array(z.string().trim().min(1).max(40)).max(24).default([]).refine((tags) => tags.every(isIndustryTag), "UNKNOWN_INDUSTRY_TAG"),
  companyPlan: z.array(z.enum(MEMBERSHIP_PLAN_CODES)).max(4).default([]),
  event: z.object({
    eventId: z.string().uuid(),
    state: z.enum(SEGMENT_EVENT_STATES),
  }).strict().nullable().default(null),
  audience: z.enum(SEGMENT_AUDIENCES).default("members"),
  contactStage: z.array(z.enum(CONTACT_STAGES)).max(6).default([]),
  contactSource: z.array(z.enum(CONTACT_SOURCES)).max(6).default([]),
}).strict();

export const segmentFilterV2Schema = segmentFilterV2Object.superRefine(refineScoreRange);

/** Alias for the current version, so the eight unrelated import sites do not churn on every bump. */
export const segmentFilterSchema = segmentFilterV2Schema;

export type SegmentFilterSet = z.infer<typeof segmentFilterV2Schema>;

/**
 * S-9. The dispatcher every read of `saved_segments.filters` goes through.
 * It lands before anything writes a v2 row: reversed, the first v2 row throws in
 * `toSavedSegment`, `savedSegmentForActor` and `membersForSegment` at once and
 * takes `/admin/segments` down for every admin.
 */
export function parseSegmentFilter(filterVersion: number, value: unknown): SegmentFilterSet {
  if (filterVersion === 1) return segmentFilterV2Schema.parse(segmentFilterV1Schema.parse(value));
  if (filterVersion === SEGMENT_FILTER_VERSION) return segmentFilterV2Schema.parse(value);
  throw new Error("UNSUPPORTED_SEGMENT_FILTER_VERSION");
}

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

/**
 * The v2 controls are `<select>`s and checkbox groups whose "any" option posts
 * an empty string. `segmentRouteQuerySchema` is `.strict()` and its filter parse
 * throws on page render, so a blank option has to mean "any" — the same call the
 * F11 tri-state made for `whatsappOptIn` — rather than a 500 on /admin/segments.
 */
const queryVocabularyListSchema = z.union([z.string(), z.array(z.string())]).optional().transform((value) => {
  const items = value === undefined ? [] : (Array.isArray(value) ? value : [value]);
  return items.map((item) => item.trim()).filter((item) => item !== "");
});

const queryVocabularySchema = z.union([z.string(), z.number()]).optional().transform((value) => {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
});

export const segmentRouteQuerySchema = z.object({
  profileId: queryListSchema,
  tier: queryListSchema,
  status: queryListSchema,
  scoreMin: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  scoreMax: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  renewalWithinDays: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  sector: z.string().optional().default(""),
  lastLoginBeforeDays: z.union([z.string(), z.number()]).optional().transform((value) => value ?? null),
  whatsappOptIn: z.union([z.string(), z.boolean()]).optional().transform((value) => value ?? null),
  industryTag: queryVocabularyListSchema,
  companyPlan: queryVocabularyListSchema,
  // The composite `event` filter arrives as two flat params: these query schemas
  // handle only strings and arrays of strings, never a nested object.
  eventId: queryVocabularySchema,
  eventState: queryVocabularySchema,
  audience: queryVocabularySchema,
  contactStage: queryVocabularyListSchema,
  contactSource: queryVocabularyListSchema,
  limit: z.union([z.string(), z.number()]).optional().default(50),
  cursor: z.string().nullable().optional().default(null),
}).strict().transform(({profileId, tier, status, scoreMin, scoreMax, renewalWithinDays, sector, lastLoginBeforeDays, whatsappOptIn, industryTag, companyPlan, eventId, eventState, audience, contactStage, contactSource, limit, cursor}): SegmentPreviewInput => ({
  filter: segmentFilterSchema.parse({
    profileIds: profileId, tier, status, scoreMin, scoreMax, renewalWithinDays, sector, lastLoginBeforeDays, whatsappOptIn,
    industryTags: industryTag,
    companyPlan,
    // An event chosen with the state control left blank means "registered": the
    // Task 7 preset always sends both params, and a half-filled form must not
    // throw on render.
    event: eventId === undefined ? null : {eventId, state: eventState ?? "registered"},
    audience,
    contactStage,
    contactSource,
  }),
  limit: segmentPaginationSchema.shape.limit.parse(limit),
  cursor: segmentPaginationSchema.shape.cursor.parse(cursor),
}));

export function parseSegmentRouteQuery(input: unknown): SegmentPreviewInput {
  return segmentRouteQuerySchema.parse(input);
}
