import { z } from "zod";
export const SUPPORT_NEXT_ACTIONS = [
  "none",
  "reply",
  "await_member",
  "identity_support",
  "payment_reconciliation",
  "delivery_reconciliation",
  "handoff",
  "follow_up_complete",
] as const;
export const SUPPORT_CLOSE_REASONS = [
  "resolved",
  "member_withdrew",
  "duplicate",
  "escalated",
] as const;
const version = z.union([z.literal("0"), z.string().uuid()]);
const note = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (value) =>
      !/(?:[?&](?:token|code|state|session|key|auth|verifier)=|bearer\s+[a-z0-9_.-]+|(?:sk|whsec)_(?:test|live|[a-z0-9]))/i.test(
        value,
      ),
    "AUTH_SECRET_NOT_ALLOWED",
  );
const supportFollowUpBaseSchema = z
  .object({
    conversationId: z.string().uuid(),
    expectedVersion: version,
    expectedAssignedToProfileId: z.string().min(1).max(255).nullable(),
    ownerProfileId: z.string().min(1).max(255).nullable(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    nextActionCode: z.enum(SUPPORT_NEXT_ACTIONS),
    handling: z.enum(["human", "bot", "closed"]),
    closeReason: z.enum(SUPPORT_CLOSE_REASONS).nullable(),
    applicationId: z.string().uuid().nullable(),
    billingAttemptId: z.string().uuid().nullable(),
    supportReference: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/)
      .nullable(),
    handoffNote: note,
  })
  .strict();
export const supportFollowUpPatchSchema = supportFollowUpBaseSchema.refine(
  (value) =>
    value.handling === "closed"
      ? value.closeReason !== null &&
        value.nextActionCode === "follow_up_complete"
      : value.closeReason === null &&
        value.nextActionCode !== "follow_up_complete",
  "CLOSE_REASON_REQUIRED",
);
export const supportFollowUpContextSchema = supportFollowUpBaseSchema
  .omit({ expectedVersion: true, expectedAssignedToProfileId: true })
  .extend({ supportVersion: z.string().uuid() })
  .strict();
export type SupportFollowUpPatch = z.infer<typeof supportFollowUpPatchSchema>;
export type SupportFollowUpContext = z.infer<
  typeof supportFollowUpContextSchema
>;
export type SupportFollowUp = Readonly<{
  version: string;
  ownerProfileId: string | null;
  dueAt: string | null;
  nextActionCode: (typeof SUPPORT_NEXT_ACTIONS)[number];
  handling: "bot" | "human" | "closed";
  closeReason: (typeof SUPPORT_CLOSE_REASONS)[number] | null;
  applicationId: string | null;
  billingAttemptId: string | null;
  supportReference: string | null;
  handoffNote: string;
  timeline: readonly Readonly<{
    at: string;
    actorType: string;
    context: SupportFollowUpContext;
  }>[];
}>;
export type SupportFollowUpState = Readonly<{
  status: "idle" | "saved" | "error";
  version?: string;
  ownerProfileId?: string | null;
  code?: "conflict" | "invalid" | "unavailable";
}>;
