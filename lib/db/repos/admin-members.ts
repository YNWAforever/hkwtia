import "server-only";

import {and, asc, eq, gt, ilike, isNull, or, sql} from "drizzle-orm";

import type {AdminMemberListItem, AdminMemberPage, AdminMemberQuery} from "@/lib/admin/member-types";
import {requireAdmin} from "@/lib/auth/actor";
import {companies, companyMembers, engagementScores, memberships, profiles} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

type CursorPayload = Readonly<{displayName: string; profileId: string}>;

function encodeCursor(item: AdminMemberListItem): string {
  return Buffer.from(JSON.stringify({displayName: item.displayName.toLocaleLowerCase("en"), profileId: item.profileId}), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("INVALID_CURSOR");
    const value = parsed as Record<string, unknown>;
    if (typeof value.displayName !== "string" || typeof value.profileId !== "string") throw new Error("INVALID_CURSOR");
    return {displayName: value.displayName, profileId: value.profileId};
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function toItem(row: {profileId: string; displayName: string; email: string | null; companyName: string | null; planCode: string | null; membershipStatus: string | null; renewalAt: Date | null; score: string | null}): AdminMemberListItem {
  const numericScore = row.score === null ? null : Number(row.score);
  return {profileId: row.profileId, displayName: row.displayName, email: row.email, companyName: row.companyName, planCode: row.planCode, membershipStatus: row.membershipStatus, renewalAt: row.renewalAt?.toISOString() ?? null, score: numericScore !== null && Number.isFinite(numericScore) ? numericScore : null};
}

/** Staff-only server-side member search with an opaque pagination cursor. */
export const adminMembersRepository = {
  async search(actor: Actor, query: AdminMemberQuery): Promise<AdminMemberPage> {
    requireAdmin(actor);
    const db = await getDb();
    const normalizedDisplayName = sql<string>`lower(${profiles.displayName})`;
    const cursor = decodeCursor(query.cursor);
    const filters = [];
    if (query.search) filters.push(or(ilike(profiles.displayName, `%${query.search}%`), ilike(profiles.email, `%${query.search}%`), ilike(companies.displayName, `%${query.search}%`)));
    if (cursor) filters.push(or(gt(normalizedDisplayName, cursor.displayName), and(eq(normalizedDisplayName, cursor.displayName), gt(profiles.id, cursor.profileId))));

    const rows = await db.select({profileId: profiles.id, displayName: profiles.displayName, email: profiles.email, companyName: companies.displayName, planCode: memberships.planCode, membershipStatus: memberships.status, renewalAt: memberships.billingPeriodEnd, score: engagementScores.score})
      .from(profiles)
      .leftJoin(companyMembers, and(eq(companyMembers.userId, profiles.id), isNull(companyMembers.revokedAt)))
      .leftJoin(companies, eq(companies.id, companyMembers.companyId))
      .leftJoin(memberships, or(eq(memberships.ownerUserId, profiles.id), eq(memberships.companyId, companyMembers.companyId)))
      .leftJoin(engagementScores, eq(engagementScores.profileId, profiles.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(normalizedDisplayName), asc(profiles.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(toItem);
    return {items, nextCursor: hasNextPage && items.length > 0 ? encodeCursor(items[items.length - 1]) : null};
  },
};
