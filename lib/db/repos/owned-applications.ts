import "server-only";
import {and, eq, getTableColumns, sql} from "drizzle-orm";
import {getDb, type Database} from "@/lib/db/repos/common";
import {membershipApplications as applications} from "@/lib/db/server-schema";
import {createOwnedApplicationReader} from "@/lib/membership/owned-application-reader";

/** Applicant-only reads; PostgreSQL execution is covered by gated acceptance tests. */
export function createOwnedApplicationsRepository(load: () => Promise<Database> = getDb) {
  return createOwnedApplicationReader({
    async select({ownerId, take, after}) {
      const db = await load();
      // Match the composite index null ordering; both key columns are NOT NULL.
      return db.select({
        ...getTableColumns(applications),
        cursorTime: sql<string>`to_char(${applications.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(applications).where(and(
        eq(applications.applicantUserId, ownerId),
        after ? sql`(${applications.updatedAt}, ${applications.id}) < (${after.time}::timestamptz, ${after.id}::uuid)` : sql`true`,
      )).orderBy(sql`${applications.updatedAt} DESC NULLS LAST`, sql`${applications.id} DESC NULLS LAST`).limit(take);
    },
    async find({ownerId, id}) {
      const db = await load();
      const rows = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.applicantUserId, ownerId))).limit(1);
      return rows[0] ?? null;
    },
  });
}
