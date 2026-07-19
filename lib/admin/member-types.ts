import {z} from "zod";

export type AdminMemberListItem = Readonly<{
  profileId: string;
  displayName: string;
  email: string | null;
  companyName: string | null;
  planCode: string | null;
  membershipStatus: string | null;
  renewalAt: string | null;
  score: number | null;
}>;

export type AdminMemberPage = Readonly<{items: readonly AdminMemberListItem[]; nextCursor: string | null}>;
export type AdminMemberCursor = Readonly<{displayName: string; profileId: string}>;

const adminMemberCursorPayloadSchema = z.object({displayName: z.string(), profileId: z.string()}).strict();

export function decodeAdminMemberCursor(cursor: string | null): AdminMemberCursor | null {
  if (!cursor) return null;
  try {
    return adminMemberCursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export function encodeAdminMemberCursor(item: Pick<AdminMemberListItem, "displayName" | "profileId">): string {
  return Buffer.from(JSON.stringify({displayName: item.displayName.toLocaleLowerCase("en"), profileId: item.profileId}), "utf8").toString("base64url");
}

export const adminMemberCursorSchema = z.string().max(500).superRefine((cursor, context) => {
  try { decodeAdminMemberCursor(cursor); } catch { context.addIssue({code: z.ZodIssueCode.custom, message: "Invalid member cursor"}); }
});

export const adminMemberQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: adminMemberCursorSchema.nullable().default(null),
});

export type AdminMemberQuery = z.infer<typeof adminMemberQuerySchema>;

export const adminMemberRouteQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: adminMemberCursorSchema.nullable().optional().default(null),
}).transform(({q, limit, cursor}): AdminMemberQuery => ({search: q, limit, cursor}));

export function parseAdminMemberRouteQuery(input: unknown): AdminMemberQuery {
  return adminMemberRouteQuerySchema.parse(input);
}
