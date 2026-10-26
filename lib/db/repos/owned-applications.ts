import "server-only";
import {and, desc, eq, getTableColumns, sql} from "drizzle-orm";
import {getDb, type Database} from "@/lib/db/repos/common";
import {membershipApplications as applications} from "@/lib/db/server-schema";
import {createOwnedApplicationReader} from "@/lib/membership/owned-application-reader";

/** Uses the existing repository loader and scoped SQL. Unit proxy-driver tests
 * render this query; execution against PostgreSQL remains separately gated. */
export function createOwnedApplicationsRepository(load: () => Promise<Database> = getDb) {
  return createOwnedApplicationReader({
    async select({ownerId, take, after}) {
      const db = await load();
      return db.select({
        ...getTableColumns(applications),
        cursorTime: sql<string>`to_char(${applications.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(applications).where(and(
        eq(applications.applicantUserId, ownerId),
        after ? sql`(${applications.updatedAt} < ${after.time}::timestamptz OR (${applications.updatedAt} = ${after.time}::timestamptz AND ${applications.id} < ${after.id}::uuid))` : sql`true`,
      )).orderBy(desc(applications.updatedAt), desc(applications.id)).limit(take);
    },
    async find({ownerId, id}) {
      const db = await load();
      const rows = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.applicantUserId, ownerId))).limit(1);
      return rows[0] ?? null;
    },
  });
}
