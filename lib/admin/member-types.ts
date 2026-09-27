import {adminMemberCursorSchema, type AdminMemberQuery} from "@/lib/admin/member-query";

export type AdminMemberListItem = Readonly<{
  profileId: string;
  membershipId: string | null;
  companyId: string | null;
  displayName: string;
  email: string | null;
  companyName: string | null;
  planCode: string | null;
  membershipStatus: string | null;
  renewalAt: string | null;
  score: number | null;
  matchingMembershipIds: readonly string[];
}>;

export type AdminMemberPage = Readonly<{items: readonly AdminMemberListItem[]; nextCursor: string | null; totalMatching: number}>;
export {adminMemberCursorSchema, adminMemberQuerySchema, adminMemberRouteQuerySchema, decodeAdminMemberCursor, encodeAdminMemberCursor, parseAdminMemberRouteQuery} from "@/lib/admin/member-query";
export type {AdminMemberCursor, AdminMemberQuery} from "@/lib/admin/member-query";

/** Opaque local pagination trail; never accept a client-supplied return URL. */
export function parseAdminMemberHistory(input: unknown): readonly (string | null)[] {
  if (input == null) return [];
  if (typeof input !== "string" || input.length > 2000) throw new Error("INVALID_HISTORY");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(input, "base64url").toString("utf8")); }
  catch { throw new Error("INVALID_HISTORY"); }
  if (!Array.isArray(decoded) || decoded.length > 10
    || decoded.some((cursor) => cursor !== null && (typeof cursor !== "string" || !adminMemberCursorSchema.safeParse(cursor).success))) {
    throw new Error("INVALID_HISTORY");
  }
  return decoded;
}

export function adminMemberListHref(localePrefix: string, query: Readonly<{search: string; limit: number; cursor: string | null} & Partial<AdminMemberQuery>>, history: readonly (string | null)[] = []): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  for (const value of query.status ?? []) params.append("status", value);
  for (const value of query.planCode ?? []) params.append("planCode", value);
  if (query.renewalFrom) params.set("renewalFrom", query.renewalFrom);
  if (query.renewalTo) params.set("renewalTo", query.renewalTo);
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.locale) params.set("locale", query.locale);
  if (query.completeness && query.completeness !== "any") params.set("completeness", query.completeness);
  if (query.sort && query.sort !== "name_asc") params.set("sort", query.sort);
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  if (history.length) params.set("history", Buffer.from(JSON.stringify(history), "utf8").toString("base64url"));
  const encoded = params.toString();
  return `${localePrefix}/admin/members${encoded ? `?${encoded}` : ""}`;
}
