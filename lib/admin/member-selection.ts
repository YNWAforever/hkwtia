import {z} from "zod";

import {adminMemberQuerySchema} from "@/lib/admin/member-query";

const profileIds = z.array(z.string().trim().min(1).max(200)).max(5000)
  .transform((values) => [...new Set(values)]);

const idsSelection = z.object({mode: z.literal("ids"), profileIds: profileIds.refine((values) => values.length > 0, "EMPTY_SELECTION")}).strict();
const querySelection = z.object({
  mode: z.literal("query"),
  query: adminMemberQuerySchema,
  excludedProfileIds: profileIds,
}).strict().superRefine(({query}, context) => {
  if (query.cursor) context.addIssue({code: z.ZodIssueCode.custom, path: ["query", "cursor"], message: "CURSOR_NOT_A_FILTER"});
  if (!query.search && query.status.length === 0 && query.planCode.length === 0
    && !query.renewalFrom && !query.renewalTo && !query.companyId && !query.locale
    && query.completeness === "any") {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["query"], message: "UNBOUNDED_SELECTION"});
  }
});

export const memberSelectionSchema = z.union([idsSelection, querySelection]);
export type MemberSelection = z.infer<typeof memberSelectionSchema>;

/** IDs are candidates only; authorization and eligibility are checked at the server snapshot. */
export function parseMemberSelection(input: unknown): MemberSelection {
  return memberSelectionSchema.parse(input);
}
