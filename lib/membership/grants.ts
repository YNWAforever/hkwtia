import {z} from "zod";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

/** A finite grant is separate from billing periods and from historical indefinite comps. */
export const grantInputSchema = z.object({
  target: z.discriminatedUnion("kind", [
    z.object({kind: z.literal("profile"), profileId: z.string().trim().min(1).max(200)}).strict(),
    z.object({kind: z.literal("company"), companyId: z.string().uuid()}).strict(),
  ]),
  planCode: z.enum(MEMBERSHIP_PLAN_CODES),
  effectiveAt: z.string().datetime({offset: true}),
  expiresAt: z.string().datetime({offset: true}),
  reason: z.string().trim().min(10).max(1000),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.effectiveAt) >= Date.parse(value.expiresAt)) context.addIssue({code: "custom", path: ["expiresAt"], message: "GRANT_WINDOW_INVALID"});
});
export type MembershipGrantInput = z.output<typeof grantInputSchema>;

export function isMembershipGrantEffectiveAt(window: Readonly<{effectiveAt: Date | null; expiresAt: Date | null}>, now: Date): boolean {
  if (window.effectiveAt === null && window.expiresAt === null) return true; // Existing comp and paid rows.
  if (!window.effectiveAt || !window.expiresAt) return false;
  return window.effectiveAt.getTime() <= now.getTime() && now.getTime() < window.expiresAt.getTime();
}
