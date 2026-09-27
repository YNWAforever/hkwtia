import {createHash} from "node:crypto";

import {z} from "zod";

import {memberSelectionSchema} from "@/lib/admin/member-selection";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

const idempotencyKey = z.string().uuid();
const profileTarget = z.object({kind: z.literal("profile"), profileId: z.string().min(1).max(200)}).strict();
const companyTarget = z.object({kind: z.literal("company"), companyId: z.string().uuid()}).strict();
const grantTarget = z.discriminatedUnion("kind", [profileTarget, companyTarget]);
const common = {idempotencyKey};
const patchPayload = z.object({patch: z.object({locale: z.enum(["en", "zh-HK"]).optional(), tags: z.array(z.string().trim().min(1).max(30)).max(10).refine((tags) => new Set(tags).size === tags.length, "DUPLICATE_TAG").optional(), ownerProfileId: z.string().trim().min(1).max(200).nullable().optional()}).strict().refine((patch) => Object.keys(patch).length > 0, "EMPTY_PATCH"), reason: z.string().trim().min(3).max(500)}).strict();
const channel = z.enum(["email", "whatsapp"]);
const isoInstant = z.string().datetime({offset: true});
const memberFields = z.enum(["displayName", "email", "companyName", "planCode", "membershipStatus", "renewalAt", "locale"]);

export const batchRequestSchema = z.discriminatedUnion("operation", [
  z.object({...common, operation: z.literal("profile_patch"), selection: memberSelectionSchema, payload: patchPayload}).strict(),
  z.object({...common, operation: z.literal("import_commit"), payload: z.object({importRunId: z.string().uuid()}).strict()}).strict(),
  z.object({...common, operation: z.literal("membership_grant"), targets: z.array(grantTarget).min(1).max(5000), payload: z.object({planCode: z.enum(MEMBERSHIP_PLAN_CODES), effectiveAt: isoInstant, expiresAt: isoInstant, reason: z.string().trim().min(10).max(1000)}).strict().refine((payload) => Date.parse(payload.effectiveAt) < Date.parse(payload.expiresAt), "INVALID_GRANT_WINDOW")}).strict(),
  z.object({...common, operation: z.literal("renewal_reminder"), membershipIds: z.array(z.string().uuid()).min(1).max(5000), payload: z.object({channel, segmentId: z.string().uuid()}).strict()}).strict(),
  z.object({...common, operation: z.literal("profile_update_invite"), selection: memberSelectionSchema, payload: z.object({channel, segmentId: z.string().uuid()}).strict()}).strict(),
  z.object({...common, operation: z.literal("ticket_resend"), targetSeatIds: z.array(z.string().uuid()).min(1).max(5000), payload: z.object({}).strict()}).strict(),
  z.object({...common, operation: z.literal("export_event_attendees"), payload: z.object({eventId: z.string().uuid(), search: z.string().trim().max(120).default("")}).strict()}).strict(),
  z.object({...common, operation: z.literal("export_members"), selection: memberSelectionSchema, payload: z.object({fields: z.array(memberFields).min(1).max(7).refine((fields) => new Set(fields).size === fields.length, "DUPLICATE_FIELDS")}).strict()}).strict(),
]);
export type BatchRequest = z.infer<typeof batchRequestSchema>;
export type BatchOperation = BatchRequest["operation"];
export const BATCH_STATES = ["preparing", "ready", "queued", "running", "completed", "completed_with_errors", "cancelled", "expired"] as const;
export const BATCH_ITEM_STATES = ["pending", "running", "succeeded", "skipped", "failed"] as const;
export type BatchState = typeof BATCH_STATES[number];
export type BatchItemState = typeof BATCH_ITEM_STATES[number];
export type BatchTarget = Readonly<{type: "profile" | "membership" | "company" | "ticket_seat" | "import_row" | "event"; id: string}>;
export type BatchPreviewItem = Readonly<{target: BatchTarget; previewStatus: "eligible" | "skipped" | "blocked"; eligible: boolean; reasonCode: string | null; before: Readonly<Record<string, unknown>>; after: Readonly<Record<string, unknown>>; expectedVersion: string}>;
export type BatchProgressItem = BatchPreviewItem & Readonly<{state: BatchItemState; attemptCount: number; errorCode: string | null; resultRef: string | null}>;
export type BatchPreview = Readonly<{counters: Readonly<Record<BatchItemState, number>>; batchId: string; operation: BatchOperation; state: BatchState; digest: string; expiresAt: string; total: number; eligible: number; skipped: number; blocked: number; items: readonly BatchProgressItem[]}>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function batchPreviewDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
const retryDelays = [60_000, 300_000, 900_000, 3_600_000] as const;
export function batchRetryDelayMs(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("INVALID_BATCH_ATTEMPT");
  return retryDelays[Math.min(attempt - 1, retryDelays.length - 1)]!;
}
function boundedSetting(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error("INVALID_BATCH_CONFIGURATION");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error("INVALID_BATCH_CONFIGURATION");
  return parsed;
}
export function batchRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxItems: boundedSetting(env.ADMIN_BATCH_MAX_ITEMS, 5000, 1, 5000),
    claimSize: boundedSetting(env.ADMIN_BATCH_CLAIM_SIZE, 50, 1, 50),
    maxAttempts: boundedSetting(env.ADMIN_BATCH_MAX_ATTEMPTS, 5, 1, 5),
    previewTtlMs: boundedSetting(env.ADMIN_BATCH_PREVIEW_TTL_MINUTES, 30, 1, 120) * 60_000,
  } as const;
}
