import "server-only";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Membership} from "@/lib/db/server-schema";
import type {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import type {Actor,AdminActor} from "@/lib/membership/lifecycle";
export type CompMembershipInput=Readonly<{profileId:string;planCode:(typeof MEMBERSHIP_PLAN_CODES)[number]}>;
/** Compatibility type for old callers; the retired endpoint never loads or executes it. */
export type CompMembershipDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  hasLiveMembership: (profileId: string) => Promise<boolean>;
  planSeatAllowance: (planCode: CompMembershipInput["planCode"]) => Promise<number | null>;
  insertMembership: (input: Readonly<{
    ownerUserId: string;
    companyId: null;
    planCode: CompMembershipInput["planCode"];
    status: "active";
    seatLimit: number;
  }>) => Promise<Membership>;
  insertAudit: (input: Readonly<{
    actorUserId: string;
    actorType: AdminActor["kind"];
    action: "membership.comped";
    targetType: "membership";
    targetId: string;
    metadata: Record<string, unknown>;
  }>) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;


/** Retained for stale server-action requests. Historical comp rows are never rewritten. */
export async function compMembership(actor:Actor,_input:unknown,_dependencies?:CompMembershipDependencies):Promise<Membership>{
 void _input; void _dependencies;
 requireAdmin(actor);
 throw new Error("LEGACY_COMP_RETIRED");
}
export const adminMembershipRepository={comp:compMembership};
