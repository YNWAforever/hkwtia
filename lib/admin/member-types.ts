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

export const adminMemberQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).nullable().default(null),
});

export type AdminMemberQuery = z.infer<typeof adminMemberQuerySchema>;
