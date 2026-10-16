import "server-only";

import {and,eq,sql} from "drizzle-orm";
import {forbidden,type Actor} from "@/lib/membership/lifecycle";
import {getDb} from "@/lib/db/repos/common";
import {companyMembers,memberships,type Membership} from "@/lib/db/server-schema";

/** Narrow Member360 correlation read; lifecycle writes remain in jobsRepository. */
export async function readPaymentCorrelation(actor:Actor,profileId:string,membershipId:string):Promise<Membership|null>{
 if(actor.kind!=="superadmin")forbidden();
 const db=await getDb();
 const rows=await db.select().from(memberships).where(and(eq(memberships.id,membershipId),sql`(${memberships.ownerUserId}=${profileId} OR EXISTS (SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId}=${memberships.companyId} AND ${companyMembers.userId}=${profileId} AND ${companyMembers.revokedAt} IS NULL))`)).limit(1);
 return rows[0]??null;
}
