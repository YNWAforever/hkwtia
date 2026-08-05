import "server-only";

export {AuthorizationError, forbidden, requireMember, requireSystem} from "@/lib/membership/lifecycle";

export type Database = typeof import("@/lib/db/client").db;

export async function getDb(): Promise<Database> {
  return (await import("@/lib/db/client")).db;
}

